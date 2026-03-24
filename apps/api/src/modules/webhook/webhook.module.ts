import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { EventModule } from '../event/event.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    EventModule,
    BullModule.registerQueue({
      name: 'webhook-events',
    }),
  ],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
