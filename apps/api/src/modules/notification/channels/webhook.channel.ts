import { Injectable, Logger } from '@nestjs/common';

interface WebhookPayload {
  webhookUrl?: string;
  title: string;
  content: string;
}

@Injectable()
export class WebhookChannel {
  private readonly logger = new Logger(WebhookChannel.name);

  async send(payload: WebhookPayload): Promise<boolean> {
    if (!payload.webhookUrl) {
      this.logger.warn('No webhook URL specified');
      return false;
    }

    // TODO: 实现真实的 webhook 调用
    this.logger.log(`[Webhook] Sending to ${payload.webhookUrl}: ${payload.title}`);

    // Mock 实现
    return true;
  }
}