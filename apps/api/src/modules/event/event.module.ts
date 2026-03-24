import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { EventProcessor } from './event.processor';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-events',
    }),
  ],
  controllers: [EventController],
  providers: [EventService, EventProcessor],
  exports: [EventService],
})
export class EventModule {}
