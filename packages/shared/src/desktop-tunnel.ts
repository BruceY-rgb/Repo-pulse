/**
 * 桌面端「自动隧道」状态类型（跨 main / preload / 渲染进程共享）。
 *
 * 主进程 TunnelManager 的状态快照经 IPC（'tunnel:status' 推送、'tunnel:refresh' 返回）
 * 透传给渲染进程；三处复用同一结构，避免在 preload/web 各自重定义而漂移。
 * 字段语义与 apps/electron 内部 `TunnelStatus` 一致（state/publicUrl/error）。
 */
export interface DesktopTunnelStatus {
  /** 隧道生命周期状态。 */
  state: 'idle' | 'starting' | 'running' | 'error' | 'stopped';
  /** 隧道就绪后的公网 URL（仅 state==='running' 时存在）。 */
  publicUrl?: string;
  /** 错误信息（仅 state==='error' 时存在）。 */
  error?: string;
}
