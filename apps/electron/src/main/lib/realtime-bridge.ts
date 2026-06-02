import type { BrowserWindow } from 'electron';
import {
  REALTIME_EVENTS,
  type DesktopRealtimeMessage,
  type EventCreatedPayload,
} from '@repo-pulse/shared';

/** 主进程 → 渲染进程的单一实时信封通道。 */
const REALTIME_CHANNEL = 'desktop:realtime';

/**
 * RealtimeBridge —— 桌面端实时推送桥（主进程侧）。
 *
 * 职责：把后端的实时事件送达渲染进程。架构上 NestJS API 与 Electron 主进程是
 * 两个独立 OS 进程，主进程拿不到 API 的内存对象，必须经网络入口。最终方案是
 * 让主进程作为 `/events` 网关的 socket.io 客户端，订阅后经 `webContents.send`
 * 转发给渲染进程（见 docs/electron-ipc-realtime-push-plan.md §1）。
 *
 * 本文件当前处于 Milestone 1：尚未接入真实网关，先用定时 mock 打通
 * 「主进程 → preload → 渲染进程 → React Query」这条管道。Milestone 2 将以
 * 真实的 socket.io-client 替换 mock，并接入 Cookie 鉴权与 join/leave 房间。
 */
export class RealtimeBridge {
  private connected = false;
  private mockTimer: ReturnType<typeof setInterval> | null = null;
  /** 按 repositoryId 的房间订阅引用计数（M2 用于 0↔1 时真正 join/leave）。 */
  private readonly roomRefCount = new Map<string, number>();

  constructor(private readonly mainWindow: BrowserWindow) {}

  /** 建立连接。幂等：已连接则直接返回（渲染进程的多个 hook 实例可安全重复调用）。 */
  connect(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;
    // M1：以定时 mock 验证 main→renderer 管道；M2 替换为真实 socket.io 连接。
    this.startMock();
  }

  /** 订阅某仓库的实时事件。引用计数 0→1 时才真正加入房间（M2 接入后生效）。 */
  subscribe(repositoryId: string, _sinceSeq?: number): void {
    const next = (this.roomRefCount.get(repositoryId) ?? 0) + 1;
    this.roomRefCount.set(repositoryId, next);
    // M2: if (next === 1) socket.emit('join:repository', { repositoryId, sinceSeq });
  }

  /** 取消订阅。引用计数 1→0 时才真正离开房间。 */
  leave(repositoryId: string): void {
    const current = this.roomRefCount.get(repositoryId) ?? 0;
    if (current <= 1) {
      this.roomRefCount.delete(repositoryId);
      // M2: socket.emit('leave:repository', { repositoryId });
    } else {
      this.roomRefCount.set(repositoryId, current - 1);
    }
  }

  /** 断开连接（仅在登出 / 应用退出时调用，不随 hook 卸载触发）。 */
  disconnect(): void {
    this.connected = false;
    this.stopMock();
    this.roomRefCount.clear();
  }

  dispose(): void {
    this.disconnect();
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

  // ---- Milestone 1 mock 脚手架（Milestone 2 将整体移除）----
  private startMock(): void {
    let seq = 0;
    this.mockTimer = setInterval(() => {
      seq += 1;
      const payload: EventCreatedPayload = {
        eventId: `mock-${seq}`,
        repositoryId: 'mock-repo',
        eventType: 'PUSH',
        seq,
        createdAt: new Date().toISOString(),
      };
      console.log('[realtime-bridge][MOCK] emit event.created', payload.eventId);
      this.emitToRenderer({ name: REALTIME_EVENTS.EVENT_CREATED, payload });
    }, 7000);
  }

  private stopMock(): void {
    if (this.mockTimer) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }
  }
}
