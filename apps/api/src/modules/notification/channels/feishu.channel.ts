import { Injectable, Logger } from '@nestjs/common';

interface FeishuPayload {
  webhookUrl?: string;
  title: string;
  content: string;
}

@Injectable()
export class FeishuChannel {
  private readonly logger = new Logger(FeishuChannel.name);

  async send(payload: FeishuPayload): Promise<boolean> {
    if (!payload.webhookUrl) {
      this.logger.warn('No Feishu webhook URL specified');
      return false;
    }

    // TODO: 实现真实的飞书 webhook 调用
    this.logger.log(`[Feishu] Sending: ${payload.title}`);

    // Mock 实现
    return true;
  }
}