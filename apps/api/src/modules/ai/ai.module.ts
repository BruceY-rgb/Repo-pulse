import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AIProcessor } from './ai-analysis.processor';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { AIEventNormalizer } from './ai-event-normalizer';
import { UserModule } from '../user/user.module';
import { ApprovalModule } from '../approval/approval.module';
import { NotificationModule } from '../notification/notification.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-analysis',
    }),
    UserModule,
    ApprovalModule,
    NotificationModule,
    forwardRef(() => EventModule),
  ],
  controllers: [AIController],
  providers: [AIProcessor, AIService, AIEventNormalizer],
  exports: [AIService, AIEventNormalizer],
})
export class AIModule {}
