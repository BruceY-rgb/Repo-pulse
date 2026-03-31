import { Injectable, Logger } from '@nestjs/common';

interface DingTalkPayload {
  webhookUrl?: string;
  title: string;
  content: string;
}

@Injectable()
export class DingTalkChannel {
  private readonly logger = new Logger(DingTalkChannel.name);

  async send(payload: DingTalkPayload): Promise<boolean> {
    if (!payload.webhookUrl) {
      this.logger.warn('No DingTalk webhook URL specified');
      return false;
    }

    // TODO: 实现真实的钉钉 webhook 调用
    this.logger.log(`[DingTalk] Sending: ${payload.title}`);

    // Mock 实现
    return true;
  }
}