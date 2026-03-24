import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RepositoryController } from './repository.controller';
import { RepositoryService } from './repository.service';
import { GithubService } from './services/github.service';
import { GitlabService } from './services/gitlab.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [ConfigModule, UserModule],
  controllers: [RepositoryController],
  providers: [RepositoryService, GithubService, GitlabService],
  exports: [RepositoryService],
})
export class RepositoryModule {}
