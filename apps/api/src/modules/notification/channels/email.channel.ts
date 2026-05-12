import { Injectable, Logger } from '@nestjs/common';
import { ChannelSendResult } from './shared';

interface EmailPayload {
  to?: string;
  subject: string;
  body: string;
}

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  async send(payload: EmailPayload): Promise<ChannelSendResult> {
    if (!payload.to) {
      this.logger.warn('No email recipient specified');
      return { success: false, failureReason: 'notification_email_missing' };
    }

    this.logger.warn('[Email] Delivery adapter not implemented yet');
    return { success: false, failureReason: 'notification_channel_not_implemented' };
  }
}
