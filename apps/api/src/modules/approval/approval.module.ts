import { forwardRef, Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { EventModule } from '../event/event.module';

@Module({
  imports: [forwardRef(() => EventModule)],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}