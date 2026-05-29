import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EmailChannel } from './channels/email.channel';
import { DingTalkChannel } from './channels/dingtalk.channel';
import { FeishuChannel } from './channels/feishu.channel';
import { WebhookChannel } from './channels/webhook.channel';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailChannel,
    DingTalkChannel,
    FeishuChannel,
    WebhookChannel,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}