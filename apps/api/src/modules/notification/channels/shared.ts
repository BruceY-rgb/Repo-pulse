export interface ChannelSendResult {
  success: boolean;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}
