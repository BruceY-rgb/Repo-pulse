import { Module } from '@nestjs/common';
import { WorkbenchController } from './workbench.controller';
import { WorkbenchService } from './workbench.service';
import { RepositoryModule } from '../repository/repository.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [RepositoryModule, SyncModule],
  controllers: [WorkbenchController],
  providers: [WorkbenchService],
  exports: [WorkbenchService],
})
export class WorkbenchModule {}

