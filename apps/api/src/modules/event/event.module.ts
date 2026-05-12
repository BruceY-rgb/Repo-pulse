import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { EventProcessor } from './event.processor';
import { EventGateway } from './event.gateway';
import { BullModule } from '@nestjs/bullmq';
import { AIModule } from '../ai/ai.module';
import { FilterModule } from '../filter/filter.module';
import { NotificationModule } from '../notification/notification.module';
import { ApprovalModule } from '../approval/approval.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-events',
    }),
    AIModule,
    FilterModule,
    NotificationModule,
    ApprovalModule,
  ],
  controllers: [EventController],
  providers: [EventGateway, EventService, EventProcessor],
  exports: [EventService, EventGateway],
})
export class EventModule {}
