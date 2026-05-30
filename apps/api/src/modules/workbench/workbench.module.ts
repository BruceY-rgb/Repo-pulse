import { Module } from '@nestjs/common';
import { WorkbenchController } from './workbench.controller';
import { WorkbenchService } from './workbench.service';
import { RepositoryModule } from '../repository/repository.module';

@Module({
  imports: [RepositoryModule],
  controllers: [WorkbenchController],
  providers: [WorkbenchService],
  exports: [WorkbenchService],
})
export class WorkbenchModule {}
