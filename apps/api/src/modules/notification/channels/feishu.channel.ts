import { Injectable, Logger } from '@nestjs/common';
import { ChannelSendResult } from './shared';

interface FeishuPayload {
  webhookUrl?: string;
  title: string;
  content: string;
}

@Injectable()
export class FeishuChannel {
  private readonly logger = new Logger(FeishuChannel.name);

  async send(payload: FeishuPayload): Promise<ChannelSendResult> {
    if (!payload.webhookUrl) {
      this.logger.warn('No Feishu webhook URL specified');
      return { success: false, failureReason: 'notification_webhook_missing' };
    }

    this.logger.warn('[Feishu] Delivery adapter not implemented yet');
    return { success: false, failureReason: 'notification_channel_not_implemented' };
  }
}
