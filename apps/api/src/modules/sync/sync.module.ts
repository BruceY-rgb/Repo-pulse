import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { BranchSyncService } from './branch-sync.service';
import { GithubService } from '../repository/services/github.service';
import { RepositoryModule } from '../repository/repository.module';
import { UserModule } from '../user/user.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [RepositoryModule, UserModule, EventModule],
  providers: [SyncService, BranchSyncService, GithubService],
  exports: [SyncService, BranchSyncService],
})
export class SyncModule {}