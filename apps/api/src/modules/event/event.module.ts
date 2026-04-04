import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { EventProcessor } from './event.processor';
import { EventGateway } from './event.gateway';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-events',
    }),
  ],
  controllers: [EventController],
  providers: [EventGateway, EventService, EventProcessor],
  exports: [EventService, EventGateway],
})
export class EventModule {}
