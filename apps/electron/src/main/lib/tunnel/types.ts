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
  /** 每次隧道进入 running 且拿到公网 URL 时触发；包括运行期异常退出后的自动重连。 */
  onPublicUrl?: (publicUrl: string) => void;
  /** 进程异常退出后的最大自动重启次数。 */
  maxRetries?: number;
}

/** TunnelOrchestrator.applyPublicUrl 的结果（写 API_URL + 重建 webhook 的综合产出）。 */
export interface OrchestratorResult {
  /** API_URL 是否成功写入后端 AppConfig。 */
  apiUrlSet: boolean;
  /** 写 API_URL 时被 403 拒绝（无可编辑仓库或权限不足）；仅失败场景出现。 */
  needsWebhookPermission?: boolean;
  /** webhook 批量重建结果（仅在 API_URL 成功且批量调用返回计数时存在）。 */
  rebuild?: {
    total: number;
    succeeded: number;
    failed: number;
  };
  /** 失败说明（任一步失败时存在，便于上层 log）。 */
  error?: string;
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
