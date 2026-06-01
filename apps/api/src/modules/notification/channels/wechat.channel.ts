import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChannelSendResult } from './shared';
import { ImService } from '../../im/im.service';

interface WechatPayload {
  userId: string;
  title: string;
  content: string;
}

@Injectable()
export class WechatChannel {
  private readonly logger = new Logger(WechatChannel.name);

  constructor(
    @Inject(forwardRef(() => ImService))
    private readonly imService: ImService,
  ) {}

  async send(payload: WechatPayload): Promise<ChannelSendResult> {
    try {
      const text = `${payload.title}\n\n${payload.content}`;
      const result = await this.imService.sendWechatNotificationDirectly(payload.userId, text);
      if (result.sent > 0) {
        return { success: true, metadata: { sent: result.sent } };
      }
      return { success: false, failureReason: result.skippedReason || 'wechat_send_skipped' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(`[Wechat] Delivery failed: ${message}`);
      return {
        success: false,
        failureReason: 'notification_wechat_send_failed',
        metadata: { error: message },
      };
    }
  }
}
