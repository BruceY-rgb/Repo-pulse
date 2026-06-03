import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { URL } from 'node:url';
import { AgentWorkspaceManager } from './lib/agent-workspace-manager';
import { AgentOrchestrator } from './lib/agent-orchestrator';
import { GitManager } from './lib/git-manager';
import { RealtimeBridge } from './lib/realtime-bridge';
import { WebhookProxy } from './lib/tunnel/webhook-proxy';
import { TunnelManager } from './lib/tunnel/tunnel-manager';
import { TunnelOrchestrator } from './lib/tunnel/tunnel-orchestrator';
import type { TunnelStatus } from './lib/tunnel/types';
import type { DesktopTunnelStatus } from '@repo-pulse/shared';

const isDev = !app.isPackaged;
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
/** 本地后端 API 基址（与 realtime-bridge 同款常量，桌面端固定走回环）。 */
const API_BASE_URL = process.env.REPO_PULSE_API_URL ?? 'http://127.0.0.1:3001';

let mainWindow: BrowserWindow | null = null;
let workspaceManager: AgentWorkspaceManager | null = null;
let agentOrchestrator: AgentOrchestrator | null = null;
let realtimeBridge: RealtimeBridge | null = null;
let webhookProxy: WebhookProxy | null = null;
let tunnelManager: TunnelManager | null = null;
let tunnelOrchestrator: TunnelOrchestrator | null = null;
/** 隧道编排只起一次：重复的 realtime:connect 不重复 spawn cloudflared。 */
let tunnelStarted = false;
/** 最近一次 tunnel:refresh 的时间戳（ms），用于防抖（< 3s 内重复点击直接忽略）。 */
let lastTunnelRefreshAt = 0;
/** tunnel:refresh 防抖窗口。 */
const TUNNEL_REFRESH_DEBOUNCE_MS = 3_000;

function getPreloadPath() {
  return path.join(__dirname, '../preload/preload.js');
}

function getPackagedWebEntry() {
  return path.join(process.resourcesPath, 'web/dist/index.html');
}

/**
 * 解析 cloudflared 二进制路径。
 * - 打包后：`<resources>/bin/cloudflared`（electron-builder 把 resources/bin 拷进 process.resourcesPath）。
 * - dev：`<appPath>/resources/bin/cloudflared`，dev 下 app.getAppPath() 指向 apps/electron。
 * Windows 追加 .exe。
 */
function resolveCloudflaredPath(): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(app.getAppPath(), 'resources', 'bin');
  const binary = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return path.join(dir, binary);
}

/**
 * 读取渲染进程会话里的 HttpOnly access_token（与 realtime-bridge.readAccessToken 同款逻辑，
 * 每次现取、不缓存，适配 token 轮换）。供 TunnelOrchestrator 注入。
 */
async function readAccessToken(): Promise<string | null> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }
  try {
    const cookies = await mainWindow.webContents.session.cookies.get({
      url: API_BASE_URL,
      name: 'access_token',
    });
    return cookies[0]?.value ?? null;
  } catch (error) {
    console.warn('[main] read access_token failed', error);
    return null;
  }
}

/**
 * TunnelManager 的状态回调：log + 把状态实时推给渲染进程（'tunnel:status' 通道），
 * 让 UI 能看到 starting/running/error 与 publicUrl。`TunnelStatus` 与跨进程
 * `DesktopTunnelStatus` 字段同构，可直接透传。
 */
function onTunnelStatus(status: TunnelStatus): void {
  console.log(
    `[main] tunnel status: ${status.state}` +
      `${status.publicUrl ? ` ${status.publicUrl}` : ''}` +
      `${status.error ? ` (${status.error})` : ''}`,
  );
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel:status', status satisfies DesktopTunnelStatus);
  }
}

/** 从当前 TunnelManager 读出快照状态（未实例化则视为 idle）。供 IPC 返回值用。 */
function buildTunnelStatus(): DesktopTunnelStatus {
  if (!tunnelManager) {
    return { state: 'idle' };
  }
  const state = tunnelManager.getState();
  const publicUrl = tunnelManager.getPublicUrl();
  if (state === 'running' && publicUrl) {
    return { state, publicUrl };
  }
  return { state };
}

/**
 * 启动「自动隧道 → 自动 webhook」编排链路（幂等，仅首次 realtime:connect 真正执行）：
 *   WebhookProxy.start() 拿临时端口 → TunnelManager.start() spawn cloudflared 拿公网 URL →
 *   TunnelOrchestrator.applyPublicUrl(publicUrl) 写后端 API_URL + 批量重建 webhook。
 * 整链路 try/catch 包裹，任何失败只 log，绝不影响 realtime 主流程。
 */
async function startTunnelOrchestrationOnce(): Promise<void> {
  if (tunnelStarted) {
    return;
  }
  tunnelStarted = true;
  try {
    if (!webhookProxy || !tunnelOrchestrator) {
      console.warn('[main] tunnel components not initialized; skip orchestration');
      return;
    }
    const { port } = await webhookProxy.start();
    console.log(`[main] webhook proxy ready on port ${port}, starting tunnel...`);
    // TunnelManager 需要确定的反代端口，故在此（端口已知后）实例化，指向反代而非本地 API。
    tunnelManager = new TunnelManager({
      cloudflaredPath: resolveCloudflaredPath(),
      targetPort: port,
      onStatus: onTunnelStatus,
    });
    const publicUrl = await tunnelManager.start();
    console.log(`[main] tunnel running at ${publicUrl}, applying to backend...`);
    const result = await tunnelOrchestrator.applyPublicUrl(publicUrl);
    if (!result.apiUrlSet) {
      console.warn('[main] tunnel orchestration: api-url not set:', result.error);
    } else if (result.error) {
      console.warn('[main] tunnel orchestration: webhook rebuild issue:', result.error);
    } else {
      console.log('[main] tunnel orchestration complete:', JSON.stringify(result.rebuild));
    }
  } catch (error) {
    // 失败不可崩主流程：允许下次 realtime:connect 重试。
    tunnelStarted = false;
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[main] tunnel orchestration failed:', message);
  }
}

/**
 * 「刷新隧道」：重启 cloudflared 拿新公网 URL 并重新应用到后端（写 API_URL + 重建 webhook）。
 * - 防抖：距上次刷新 < TUNNEL_REFRESH_DEBOUNCE_MS 直接忽略，返回当前快照。
 * - 已存在 TunnelManager → restart() 拿新 URL → orchestrator.applyPublicUrl()。
 * - 尚未启动 → 走 startTunnelOrchestrationOnce 首次启动逻辑。
 * 全程 try/catch，失败返回 { state: 'error', error }。
 */
async function refreshTunnel(): Promise<DesktopTunnelStatus> {
  const now = Date.now();
  if (now - lastTunnelRefreshAt < TUNNEL_REFRESH_DEBOUNCE_MS) {
    console.log('[main] tunnel:refresh debounced; returning current status');
    return buildTunnelStatus();
  }
  lastTunnelRefreshAt = now;

  try {
    if (!webhookProxy || !tunnelOrchestrator) {
      return { state: 'error', error: 'tunnel components not initialized' };
    }
    // 尚未首次启动：复用幂等首启逻辑（内部会实例化 TunnelManager + 应用到后端）。
    if (!tunnelManager) {
      await startTunnelOrchestrationOnce();
      return buildTunnelStatus();
    }
    // 已有隧道：重启拿新 URL 后重新应用到后端。
    const newUrl = await tunnelManager.restart();
    console.log(`[main] tunnel refreshed at ${newUrl}, re-applying to backend...`);
    const result = await tunnelOrchestrator.applyPublicUrl(newUrl);
    if (!result.apiUrlSet) {
      console.warn('[main] tunnel:refresh api-url not set:', result.error);
    } else if (result.error) {
      console.warn('[main] tunnel:refresh webhook rebuild issue:', result.error);
    } else {
      console.log('[main] tunnel:refresh complete:', JSON.stringify(result.rebuild));
    }
    return buildTunnelStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[main] tunnel:refresh failed:', message);
    return { state: 'error', error: message };
  }
}

/** 清理隧道相关资源（随窗口关闭 / 应用退出调用）。 */
function disposeTunnel(): void {
  tunnelManager?.dispose();
  void webhookProxy?.stop();
  tunnelManager = null;
  webhookProxy = null;
  tunnelOrchestrator = null;
  tunnelStarted = false;
}

function isTrustedAppUrl(url: string) {
  if (isDev) {
    return url.startsWith(devServerUrl);
  }

  return url.startsWith('file://');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: 'Repo Pulse',
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 16 } } : {}),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  workspaceManager = new AgentWorkspaceManager();
  agentOrchestrator = new AgentOrchestrator(mainWindow);
  realtimeBridge = new RealtimeBridge(mainWindow);

  // 自动隧道组件：WebhookProxy（仅暴露 /webhooks 的本地反代）→ TunnelOrchestrator（拿到公网
  // URL 后写后端 API_URL + 重建 webhook）。TunnelManager 需要反代端口，故延迟到链路启动时
  // （proxy.start() 拿到端口后）再实例化。此处仅建可立即构造的两者，真正 start 在首次
  // realtime:connect 时（已认证信号）触发。
  webhookProxy = new WebhookProxy({ targetOrigin: API_BASE_URL });
  tunnelOrchestrator = new TunnelOrchestrator({
    apiBaseUrl: API_BASE_URL,
    getToken: () => readAccessToken(),
  });

  mainWindow.on('closed', () => {
    realtimeBridge?.dispose();
    realtimeBridge = null;
    disposeTunnel();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(getPackagedWebEntry());
  }
}

function registerIpcHandlers() {
  ipcMain.handle('realtime:connect', () => {
    realtimeBridge?.connect();
    // realtime:connect 由渲染端登录后调用，是「已认证」信号：顺带（幂等地）启动自动隧道编排。
    // 不 await——隧道启动较慢（spawn + 边缘就绪探测），不阻塞 IPC 返回；失败只 log。
    void startTunnelOrchestrationOnce();
  });

  ipcMain.handle('realtime:subscribe', (_event, params: { repositoryId: string; sinceSeq?: number }) => {
    realtimeBridge?.subscribe(params.repositoryId, params.sinceSeq);
  });

  ipcMain.handle('realtime:leave', (_event, params: { repositoryId: string }) => {
    realtimeBridge?.leave(params.repositoryId);
  });

  ipcMain.handle('realtime:disconnect', () => {
    realtimeBridge?.disconnect();
  });

  ipcMain.handle('tunnel:refresh', async (): Promise<DesktopTunnelStatus> => {
    return refreshTunnel();
  });

  ipcMain.handle('desktop:open-external', async (_event, rawUrl: string) => {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol: ${url.protocol}`);
    }

    await shell.openExternal(url.toString());
  });

  ipcMain.handle('agent:start-session', async (
    _event,
    params: {
      repositoryId: string;
      gitUrl: string;
      defaultBranch: string;
      prompt: string;
      apiKey: string;
      model?: string;
      baseUrl?: string;
      authorizedLocalCwd?: string;
      sdkSessionId?: string | null;
    },
  ) => {
    if (!workspaceManager || !agentOrchestrator) {
      throw new Error('Agent systems not initialized');
    }

    const {
      repositoryId,
      gitUrl,
      defaultBranch,
      prompt,
      apiKey,
      model,
      baseUrl,
      authorizedLocalCwd,
      sdkSessionId,
    } = params;

    // 1. 准备物理工作区：优先复用本机已存在的同 remote Git 仓库
    const workspace = await workspaceManager.prepareWorkspace(repositoryId, gitUrl, defaultBranch, authorizedLocalCwd);

    // 2. 异步启动 Agent 会话，防止 IPC 调用阻塞
    void agentOrchestrator.startSession({
      prompt,
      cwd: workspace.cwd,
      apiKey,
      model,
      baseUrl,
      workspaceSource: workspace.source,
      workspaceBranch: workspace.branch,
      workspaceRemembered: workspace.remembered,
      sdkSessionId,
    });

    return {
      success: true,
      cwd: workspace.cwd,
      source: workspace.source,
      branch: workspace.branch,
      remembered: workspace.remembered,
    };
  });

  ipcMain.handle('agent:stop-session', async () => {
    if (agentOrchestrator) {
      agentOrchestrator.stopSession();
    }
    return { success: true };
  });

  ipcMain.handle('agent:resolve-permission', async (_event, params: { toolUseID: string; approve: boolean; message?: string }) => {
    if (agentOrchestrator) {
      agentOrchestrator.resolvePermission(params.toolUseID, params.approve, params.message);
    }
    return { success: true };
  });

  ipcMain.handle('git:get-status', async (_event, params: { cwd: string }) => {
    const gitManager = new GitManager();
    return gitManager.getStatus(params.cwd);
  });

  ipcMain.handle('git:select-directory', async (_event, params: { repositoryUrl: string }) => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '选择本地 Git 仓库工作区',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const pickedPath = result.filePaths[0];
    const gitManager = new GitManager();
    const verification = await gitManager.verifyRepository(pickedPath, params.repositoryUrl);

    if (!verification.success) {
      return { success: false, error: verification.error };
    }

    return {
      success: true,
      cwd: verification.gitRoot,
      branch: verification.branch,
    };
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
