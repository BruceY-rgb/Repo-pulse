import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { URL } from 'node:url';
import { AgentWorkspaceManager } from './lib/agent-workspace-manager';
import { AgentOrchestrator } from './lib/agent-orchestrator';
import { GitManager } from './lib/git-manager';
import { RealtimeBridge } from './lib/realtime-bridge';
import { WebhookProxy } from './lib/tunnel/webhook-proxy';
import { TunnelManager } from './lib/tunnel/tunnel-manager';
import { TunnelOrchestrator } from './lib/tunnel/tunnel-orchestrator';
import type { TunnelStatus, OrchestratorResult } from './lib/tunnel/types';
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
/** 最近一次已成功同步到后端的 tunnel URL，避免重复批量重建 webhook。 */
let lastAppliedTunnelUrl: string | null = null;
/** 当前正在同步到后端的 tunnel URL 与 Promise，用于合并首次 running 状态和 start()/refresh() 的重复触发。 */
let applyingTunnelUrl: string | null = null;
let applyingTunnelPromise: Promise<OrchestratorResult> | null = null;
/** 每个 Electron 进程只清一次认证 Cookie；关闭并重新打开窗口不等同于重启应用。 */
let authCookiesResetForLaunch = false;
/** tunnel:refresh 防抖窗口。 */
const TUNNEL_REFRESH_DEBOUNCE_MS = 3_000;

function getPreloadPath() {
  return path.join(__dirname, '../preload/preload.js');
}

function getPackagedWebEntry() {
  return path.join(process.resourcesPath, 'web/dist/index.html');
}

function getAppIconPath(): string | null {
  const iconFile = process.platform === 'win32' && isDev ? 'icon.ico' : 'icon.png';
  const iconPath = isDev
    ? path.join(app.getAppPath(), 'build', iconFile)
    : path.join(process.resourcesPath, 'icon.png');

  return fs.existsSync(iconPath) ? iconPath : null;
}

/**
 * 在系统常见位置 + PATH 上查找 cloudflared（兜底用）。
 * 注意：GUI 启动的 Electron PATH 通常很「瘦」（不含 /opt/homebrew/bin、/usr/local/bin），
 * 故非 Windows 显式补常见安装目录，避免「终端能跑、双击打开找不到」。
 */
function findCloudflaredOnSystem(binary: string): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  if (process.platform !== 'win32') {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin');
  }
  for (const dir of dirs) {
    const candidate = path.join(dir, binary);
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // 忽略不可访问目录
    }
  }
  return null;
}

/**
 * 解析 cloudflared 二进制路径，按优先级兜底以提升跨主机兼容性：
 *   1) 环境变量 `CLOUDFLARED_PATH`（显式指定，最高优先）；
 *   2) 随包/已 fetch 的二进制（打包后 `<resources>/bin/`，dev `<appPath>/resources/bin/`，存在才用）；
 *   3) 系统安装的 cloudflared（PATH + 常见目录，如 brew 装的）；
 *   4) 裸命令名兜底（再让 spawn 走 PATH；dev 终端通常能命中）。
 * Windows 用 `cloudflared.exe`。任何一步缺失都不致命：上层 try/catch 降级，隧道不影响主流程。
 */
function resolveCloudflaredPath(): string {
  const binary = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

  const override = process.env.CLOUDFLARED_PATH?.trim();
  if (override) {
    return override;
  }

  const bundledDir = app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(app.getAppPath(), 'resources', 'bin');
  const bundled = path.join(bundledDir, binary);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  const onSystem = findCloudflaredOnSystem(binary);
  if (onSystem) {
    console.warn(`[tunnel] bundled cloudflared missing (${bundled}); using system binary ${onSystem}`);
    return onSystem;
  }

  console.warn(
    `[tunnel] cloudflared not found (bundled=${bundled}, not on PATH). ` +
      `tunnel will fail until you run 'pnpm --filter @repo-pulse/electron fetch:cloudflared' ` +
      `or install cloudflared (or set CLOUDFLARED_PATH). falling back to bare '${binary}'.`,
  );
  return binary;
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
 * 把 orchestrator.applyPublicUrl() 的结果转成给渲染层 M3 状态卡的「降级提示」并主动推送。
 * 隧道本身已 running（publicUrl 已就绪），但「让后端 webhook 指向它」这一步出问题时：
 *   - needsWebhookPermission（写 API_URL 被 403）：推 error，文案「需要可编辑仓库权限，无法自动配置 webhook」。
 *   - 其它失败（如 webhook 批量重建部分失败）：推 error，透出 orchestrator 给的可读 error。
 * 隧道仍可用（公网 URL 有效），只是 webhook 自动配置未成功；UI 据此提示用户手动处理。
 * 成功（apiUrlSet && !error）则不额外推送，沿用 TunnelManager 已推的 running 状态。
 */
function reportOrchestrationOutcome(result: OrchestratorResult, publicUrl: string): void {
  let error: string | null = null;
  if (!result.apiUrlSet && result.needsWebhookPermission) {
    error = '需要至少一个可编辑仓库权限，无法自动配置 webhook';
  } else if (result.error) {
    // apiUrlSet=false 的其它失败，或 apiUrlSet=true 但 webhook 重建失败，均透出可读原因。
    error = `隧道已就绪，但 webhook 自动配置失败：${result.error}`;
  }
  if (!error) {
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel:status', {
      state: 'error',
      publicUrl,
      error,
    } satisfies DesktopTunnelStatus);
  }
}

/**
 * 把当前 tunnel URL 应用到后端并重建 GitHub webhook。
 * 这个函数会被三类路径调用：首次启动、手动刷新、TunnelManager 自动重连后的 running 回调。
 * 对同一个 URL 的并发调用会复用同一个 Promise；只有成功完成 API_URL 写入和 webhook 重建后才记录为已应用。
 */
async function applyTunnelPublicUrl(
  publicUrl: string,
  source: 'initial' | 'refresh' | 'auto-retry',
): Promise<OrchestratorResult> {
  if (!tunnelOrchestrator) {
    console.warn(`[main] tunnel apply skipped (${source}): orchestrator not initialized`);
    return { apiUrlSet: false, error: 'tunnel orchestrator not initialized' };
  }

  if (lastAppliedTunnelUrl === publicUrl) {
    console.log(`[main] tunnel apply skipped (${source}): url already applied`);
    return { apiUrlSet: true };
  }

  if (applyingTunnelUrl === publicUrl && applyingTunnelPromise) {
    console.log(`[main] tunnel apply joined (${source}): url already applying`);
    return applyingTunnelPromise;
  }

  applyingTunnelUrl = publicUrl;
  applyingTunnelPromise = (async () => {
    console.log(`[main] tunnel ${source} applying ${publicUrl} to backend...`);
    const result = await tunnelOrchestrator.applyPublicUrl(publicUrl);
    if (!result.apiUrlSet) {
      console.warn(`[main] tunnel ${source}: api-url not set:`, result.error);
    } else if (result.error) {
      console.warn(`[main] tunnel ${source}: webhook rebuild issue:`, result.error);
    } else {
      lastAppliedTunnelUrl = publicUrl;
      console.log(`[main] tunnel ${source} apply complete:`, JSON.stringify(result.rebuild));
    }
    reportOrchestrationOutcome(result, publicUrl);
    return result;
  })().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[main] tunnel ${source} apply failed:`, message);
    const result: OrchestratorResult = { apiUrlSet: false, error: message };
    reportOrchestrationOutcome(result, publicUrl);
    return result;
  }).finally(() => {
    if (applyingTunnelUrl === publicUrl) {
      applyingTunnelUrl = null;
      applyingTunnelPromise = null;
    }
  });

  return applyingTunnelPromise;
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
      onPublicUrl: (url) => {
        void applyTunnelPublicUrl(url, 'auto-retry');
      },
    });
    const publicUrl = await tunnelManager.start();
    await applyTunnelPublicUrl(publicUrl, 'initial');
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
    const result = await applyTunnelPublicUrl(newUrl, 'refresh');
    if (!result.apiUrlSet) {
      return {
        state: 'error',
        publicUrl: newUrl,
        error: result.error ?? 'webhook 自动配置失败',
      };
    }
    if (result.error) {
      return {
        state: 'error',
        publicUrl: newUrl,
        error: `隧道已就绪，但 webhook 自动配置失败：${result.error}`,
      };
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
  lastAppliedTunnelUrl = null;
  applyingTunnelUrl = null;
  applyingTunnelPromise = null;
}

function isTrustedAppUrl(url: string) {
  if (isDev) {
    return url.startsWith(devServerUrl);
  }

  return url.startsWith('file://');
}

function createMainWindow() {
  const appIconPath = getAppIconPath();

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
    ...(appIconPath ? { icon: appIconPath } : {}),
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

  // 每次桌面应用启动都清除旧会话。默认模式会立即自动重建；启用应用锁后，
  // ProtectedRoute 会停在解锁页，从而确保“启动时验证”不被持久 Cookie 绕过。
  const loadRenderer = async () => {
    if (!authCookiesResetForLaunch) {
      for (const origin of new Set([API_BASE_URL, 'http://127.0.0.1:3001', 'http://localhost:3001'])) {
        await Promise.all([
          mainWindow?.webContents.session.cookies.remove(origin, 'access_token'),
          mainWindow?.webContents.session.cookies.remove(origin, 'refresh_token'),
        ]);
      }
      authCookiesResetForLaunch = true;
    }

    if (isDev) {
      await mainWindow?.loadURL(devServerUrl);
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    } else {
      await mainWindow?.loadFile(getPackagedWebEntry());
    }
  };
  void loadRenderer().catch((error) => console.error('[main] renderer startup failed', error));
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
  const appIconPath = getAppIconPath();
  if (process.platform === 'darwin' && appIconPath) {
    app.dock?.setIcon(appIconPath);
  }

  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  realtimeBridge?.dispose();
  realtimeBridge = null;
  disposeTunnel();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
