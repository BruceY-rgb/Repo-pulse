/**
 * 自动隧道传输层（M1）公共类型。
 *
 * 这些类型被 WebhookProxy / TunnelManager 共享，且在 IPC / 状态上报（M2/M3）
 * 中复用，因此集中在此处定义。本文件纯类型，禁止 import electron。
 */

/** 隧道生命周期状态。 */
export type TunnelState = 'idle' | 'starting' | 'running' | 'error' | 'stopped';

/** 隧道状态快照（用于 onStatus 回调与后续 IPC 上报）。 */
export interface TunnelStatus {
  /** 当前状态。 */
  state: TunnelState;
  /** 隧道就绪后的公网 URL（仅 state==='running' 时存在）。 */
  publicUrl?: string;
  /** 错误信息（仅 state==='error' 时存在）。 */
  error?: string;
}

/** TunnelManager 构造参数。 */
export interface TunnelManagerOptions {
  /** cloudflared 二进制路径，由调用方注入（保持模块可独立测试，不解析 electron 资源路径）。 */
  cloudflaredPath: string;
  /** 隧道指向的本地端口（通常是 WebhookProxy 监听的临时端口）。 */
  targetPort: number;
  /** 状态变更回调（idle→starting→running / error / stopped）。 */
  onStatus?: (status: TunnelStatus) => void;
  /** 进程异常退出后的最大自动重启次数。 */
  maxRetries?: number;
}

/** WebhookProxy 构造参数。 */
export interface WebhookProxyOptions {
  /** 转发目标源（默认本地 API）。 */
  targetOrigin?: string;
  /** 允许转发的路径前缀，其它路径一律 404（默认 '/webhooks'）。 */
  allowedPathPrefix?: string;
  /** 监听地址（默认回环，避免反代被局域网直接访问）。 */
  host?: string;
}
