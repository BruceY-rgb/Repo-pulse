import type { BrowserWindow } from 'electron';
import { io, type Socket } from 'socket.io-client';
import {
  REALTIME_EVENTS,
  type DesktopRealtimeMessage,
  type EventCreatedPayload,
  type EventReplayDonePayload,
  type RealtimeEventName,
} from '@repo-pulse/shared';
import { LocalGitWatcher } from './local-git-watcher';

/** 主进程 → 渲染进程的单一实时信封通道。 */
const REALTIME_CHANNEL = 'desktop:realtime';
/** 本地后端 API（桌面端固定走回环）。 */
const API_BASE_URL = process.env.REPO_PULSE_API_URL ?? 'http://127.0.0.1:3001';
const EVENTS_NAMESPACE = `${API_BASE_URL}/events`;

/**
 * RealtimeBridge —— 桌面端实时推送桥（主进程侧）。
 *
 * NestJS API 与 Electron 主进程是两个独立 OS 进程，主进程拿不到 API 的内存对象，
 * 只能经网络相连。本桥让主进程作为现有 `/events` 网关的 socket.io 客户端：
 *   1. 鉴权：从渲染进程所在会话的 HttpOnly Cookie 读取 access_token，以
 *      { auth: { token } } 握手（网关 extractToken 优先读 handshake.auth.token）。
 *      因为是 Node 客户端，不受浏览器跨域/跨端口 Cookie 限制；auth 用函数形式，
 *      每次（重）连接前重读 Cookie，从而自然适配 15 分钟 access_token 轮换。
 *   2. 房间：按 repositoryId 引用计数 join/leave，与 web 端语义一致。
 *   3. 补发：自身按 seq 跟踪每个房间最新进度，重连时带 sinceSeq 重新 join，
 *      触发网关 replayMissedEvents 补发断连期间漏掉的事件。
 *   4. 转发：监听所有 REALTIME_EVENTS.*，统一封装为 { name, payload } 经
 *      webContents.send 推给渲染进程（复用 agent-orchestrator 的 main→renderer 模式）。
 */
export class RealtimeBridge {
  private socket: Socket | null = null;
  /** 按 repositoryId 的房间订阅引用计数（0↔1 时才真正 join/leave）。 */
  private readonly roomRefCount = new Map<string, number>();
  /** 每个房间已知的最新 seq，用于重连时带 sinceSeq 补发。 */
  private readonly roomLastSeq = new Map<string, number>();
  /** 本地 git 监听器：本地有该仓库 clone 时监听其 git 状态（仅前端刷新）。 */
  private readonly localGitWatcher: LocalGitWatcher;

  constructor(private readonly mainWindow: BrowserWindow) {
    this.localGitWatcher = new LocalGitWatcher(mainWindow, API_BASE_URL, () =>
      this.readAccessToken(),
    );
  }

  /** 建立连接。幂等：已存在 socket 则直接返回（渲染进程多个 hook 实例可安全重复调用）。 */
  connect(): void {
    if (this.socket) {
      return;
    }

    const socket = io(EVENTS_NAMESPACE, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // 每次（重）连接前重读 Cookie，适配 token 轮换 / 登录后才有 token 的情况。
      auth: (cb) => {
        void this.readAccessToken().then((token) => cb({ token: token ?? '' }));
      },
    });

    socket.on('connect', () => {
      console.log('[realtime-bridge] connected to /events');
      // 连接/重连后补发所有房间的 join（带各自 sinceSeq），覆盖 API 重启等断连场景。
      this.rejoinAllRooms();
    });
    socket.on('connect_error', (error: Error) => {
      console.warn('[realtime-bridge] connect_error', error.message);
    });
    socket.on('disconnect', (reason: string) => {
      console.warn('[realtime-bridge] disconnected:', reason);
    });

    for (const name of Object.values(REALTIME_EVENTS)) {
      socket.on(name, (payload: unknown) => {
        this.trackSeq(name, payload);
        this.emitToRenderer({ name, payload } as DesktopRealtimeMessage);
      });
    }

    this.socket = socket;
  }

  /** 订阅某仓库。引用计数 0→1 时真正 join；初次带入渲染端 sinceSeq 作为补发起点。 */
  subscribe(repositoryId: string, sinceSeq?: number): void {
    const next = (this.roomRefCount.get(repositoryId) ?? 0) + 1;
    this.roomRefCount.set(repositoryId, next);
    if (typeof sinceSeq === 'number' && !this.roomLastSeq.has(repositoryId)) {
      this.roomLastSeq.set(repositoryId, sinceSeq);
    }
    if (next === 1) {
      this.joinRoom(repositoryId);
      // 本地有该仓库 clone 时启动本地 git 监听（独立于 socket，登出/退出才停）。
      void this.localGitWatcher.watch(repositoryId);
    }
  }

  /** 取消订阅。引用计数 1→0 时真正 leave。 */
  leave(repositoryId: string): void {
    const current = this.roomRefCount.get(repositoryId) ?? 0;
    if (current <= 1) {
      this.roomRefCount.delete(repositoryId);
      this.localGitWatcher.unwatch(repositoryId);
      if (this.socket?.connected) {
        this.socket.emit('leave:repository', { repositoryId });
      }
    } else {
      this.roomRefCount.set(repositoryId, current - 1);
    }
  }

  /** 断开连接（仅登出 / 应用退出时调用，不随 hook 卸载触发）。 */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.roomRefCount.clear();
    this.roomLastSeq.clear();
    this.localGitWatcher.disposeAll();
  }

  dispose(): void {
    this.disconnect();
  }

  private joinRoom(repositoryId: string): void {
    if (!this.socket?.connected) {
      // 尚未连上：先记账，待 'connect' 时由 rejoinAllRooms 补发。
      return;
    }
    const sinceSeq = this.roomLastSeq.get(repositoryId);
    this.socket.emit(
      'join:repository',
      typeof sinceSeq === 'number' ? { repositoryId, sinceSeq } : { repositoryId },
    );
  }

  private rejoinAllRooms(): void {
    for (const repositoryId of this.roomRefCount.keys()) {
      this.joinRoom(repositoryId);
    }
  }

  /** 观察 event.created / event.replay-done，维护每房间最新 seq（供重连补发用）。 */
  private trackSeq(name: RealtimeEventName, payload: unknown): void {
    if (name === REALTIME_EVENTS.EVENT_CREATED) {
      const p = payload as EventCreatedPayload;
      if (typeof p?.seq === 'number' && typeof p?.repositoryId === 'string') {
        const prev = this.roomLastSeq.get(p.repositoryId) ?? 0;
        if (p.seq > prev) {
          this.roomLastSeq.set(p.repositoryId, p.seq);
        }
      }
    } else if (name === REALTIME_EVENTS.EVENT_REPLAY_DONE) {
      const p = payload as EventReplayDonePayload;
      if (typeof p?.lastSeq === 'number' && typeof p?.repositoryId === 'string') {
        const prev = this.roomLastSeq.get(p.repositoryId) ?? 0;
        if (p.lastSeq > prev) {
          this.roomLastSeq.set(p.repositoryId, p.lastSeq);
        }
      }
    }
  }

  /** 从渲染进程所在会话读取 access_token（HttpOnly 对 JS 不可见，但主进程 session API 可读）。 */
  private async readAccessToken(): Promise<string | null> {
    try {
      const cookies = await this.mainWindow.webContents.session.cookies.get({
        url: API_BASE_URL,
        name: 'access_token',
      });
      return cookies[0]?.value ?? null;
    } catch (error) {
      console.warn('[realtime-bridge] read token failed', error);
      return null;
    }
  }

  /** 把一条实时消息推给渲染进程；失败不致命。 */
  private emitToRenderer(message: DesktopRealtimeMessage): void {
    try {
      if (this.mainWindow.isDestroyed()) {
        return;
      }
      this.mainWindow.webContents.send(REALTIME_CHANNEL, message);
    } catch (error) {
      console.warn('[realtime-bridge] emit failed', error);
    }
  }
}
