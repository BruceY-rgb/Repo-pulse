import { Module, forwardRef } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { EmailChannel } from './channels/email.channel';
import { DingTalkChannel } from './channels/dingtalk.channel';
import { FeishuChannel } from './channels/feishu.channel';
import { WebhookChannel } from './channels/webhook.channel';
import { WecomChannel } from './channels/wecom.channel';
import { WechatChannel } from './channels/wechat.channel';
import { UserModule } from '../user/user.module';
import { ImModule } from '../im/im.module';

@Module({
  imports: [
    UserModule,
    forwardRef(() => ImModule),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailChannel,
    DingTalkChannel,
    FeishuChannel,
    WebhookChannel,
    WecomChannel,
    WechatChannel,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}