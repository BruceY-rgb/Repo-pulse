import { Injectable, Logger } from '@nestjs/common';
import { ChannelSendResult } from './shared';

interface DingTalkPayload {
  webhookUrl?: string;
  title: string;
  content: string;
}

@Injectable()
export class DingTalkChannel {
  private readonly logger = new Logger(DingTalkChannel.name);

  async send(payload: DingTalkPayload): Promise<ChannelSendResult> {
    if (!payload.webhookUrl) {
      this.logger.warn('No DingTalk webhook URL specified');
      return { success: false, failureReason: 'notification_webhook_missing' };
    }

    this.logger.warn('[DingTalk] Delivery adapter not implemented yet');
    return { success: false, failureReason: 'notification_channel_not_implemented' };
  }
}
