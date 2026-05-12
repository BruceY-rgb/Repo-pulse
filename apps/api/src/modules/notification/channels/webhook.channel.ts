import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ChannelSendResult } from './shared';

interface WebhookPayload {
  webhookUrl?: string;
  title: string;
  content: string;
}

@Injectable()
export class WebhookChannel {
  private readonly logger = new Logger(WebhookChannel.name);

  async send(payload: WebhookPayload): Promise<ChannelSendResult> {
    if (!payload.webhookUrl) {
      this.logger.warn('No webhook URL specified');
      return { success: false, failureReason: 'notification_webhook_missing' };
    }

    try {
      const response = await axios.post(
        payload.webhookUrl,
        {
          title: payload.title,
          content: payload.content,
        },
        {
          timeout: 5000,
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        this.logger.warn(
          `[Webhook] Delivery failed with status ${response.status}: ${payload.title}`,
        );
        return {
          success: false,
          failureReason: `notification_webhook_http_${response.status}`,
          metadata: { statusCode: response.status },
        };
      }

      this.logger.log(`[Webhook] Sent to ${payload.webhookUrl}: ${payload.title}`);
      return { success: true, metadata: { statusCode: response.status } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(`[Webhook] Delivery failed: ${message}`);
      return {
        success: false,
        failureReason: 'notification_webhook_request_failed',
        metadata: { error: message },
      };
    }
  }
}
