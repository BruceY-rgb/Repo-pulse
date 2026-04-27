import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AIProcessor } from './ai-analysis.processor';
import { AIService } from './ai.service';
import { AIController } from './ai.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-analysis',
    }),
    UserModule,
  ],
  controllers: [AIController],
  providers: [AIProcessor, AIService],
  exports: [AIService],
})
export class AIModule {}
