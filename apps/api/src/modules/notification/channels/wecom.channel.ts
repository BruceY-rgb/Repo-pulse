import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ChannelSendResult } from './shared';

interface WecomPayload {
  webhookUrl?: string;
  title: string;
  content: string;
}

@Injectable()
export class WecomChannel {
  private readonly logger = new Logger(WecomChannel.name);

  async send(payload: WecomPayload): Promise<ChannelSendResult> {
    if (!payload.webhookUrl) {
      this.logger.warn('No Wecom webhook URL specified');
      return { success: false, failureReason: 'notification_webhook_missing' };
    }

    try {
      const response = await axios.post(
        payload.webhookUrl,
        {
          msgtype: 'markdown',
          markdown: {
            content: `### ${payload.title}\n${payload.content}`,
          },
        },
        {
          timeout: 5000,
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        this.logger.warn(
          `[Wecom] Delivery failed with status ${response.status}: ${payload.title}`,
        );
        return {
          success: false,
          failureReason: `notification_wecom_webhook_http_${response.status}`,
          metadata: { statusCode: response.status },
        };
      }

      this.logger.log(`[Wecom] Sent to ${payload.webhookUrl}: ${payload.title}`);
      return { success: true, metadata: { statusCode: response.status } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(`[Wecom] Delivery failed: ${message}`);
      return {
        success: false,
        failureReason: 'notification_wecom_webhook_request_failed',
        metadata: { error: message },
      };
    }
  }
}
