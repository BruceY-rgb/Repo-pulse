import { Injectable, Logger } from '@nestjs/common';

interface EmailPayload {
  to?: string;
  subject: string;
  body: string;
}

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  async send(payload: EmailPayload): Promise<boolean> {
    if (!payload.to) {
      this.logger.warn('No email recipient specified');
      return false;
    }

    // TODO: 实现真实的邮件发送逻辑 (Nodemailer)
    this.logger.log(`[Email] Sending to ${payload.to}: ${payload.subject}`);

    // Mock 实现
    return true;
  }
}