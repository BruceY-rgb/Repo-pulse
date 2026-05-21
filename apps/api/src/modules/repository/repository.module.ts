import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { QUEUE_NAMES } from '@repo-pulse/shared';
import { RepositoryController } from './repository.controller';
import { RepositoryService } from './repository.service';
import { RepositorySyncProcessor } from './repository-sync.processor';
import { GithubService } from './services/github.service';
import { GitlabService } from './services/gitlab.service';
import { UserModule } from '../user/user.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    EventModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.REPOSITORY_SYNC }),
  ],
  controllers: [RepositoryController],
  providers: [
    RepositoryService,
    GithubService,
    GitlabService,
    RepositorySyncProcessor,
  ],
  exports: [RepositoryService, BullModule],
})
export class RepositoryModule {}
