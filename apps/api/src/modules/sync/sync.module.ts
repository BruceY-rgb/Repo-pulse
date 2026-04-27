import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { GithubService } from '../repository/services/github.service';
import { RepositoryModule } from '../repository/repository.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [RepositoryModule, UserModule],
  providers: [SyncService, GithubService],
  exports: [SyncService],
})
export class SyncModule {}