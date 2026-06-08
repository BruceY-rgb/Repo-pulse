import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  HttpCode,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@repo-pulse/shared';
import { RepositoryService } from './repository.service';
import { UserService } from '../user/user.service';
import { EventGateway } from '../event/event.gateway';
import {
  CreateRepositoryDto,
  UpdateRepositoryDto,
  RepositoryQueryDto,
} from './dto/repository.dto';
import type { RepositorySyncJob } from './repository-sync.processor';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

@ApiTags('Repository Management')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('repositories')
export class RepositoryController {
  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly userService: UserService,
    private readonly eventGateway: EventGateway,
    @InjectQueue(QUEUE_NAMES.REPOSITORY_SYNC)
    private readonly syncQueue: Queue<RepositorySyncJob>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create repository' })
  async create(@Req() req: Request, @Body() dto: CreateRepositoryDto) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findGithubCredentials(userId);
    const repository = await this.repositoryService.create(userId, dto, {
      userOAuthToken: user?.githubAccessToken || undefined,
    });
    try {
      this.eventGateway.broadcastRepositoryUpdated({ userId, repositoryId: repository.id });
    } catch {
      // 实时广播为尽力而为，失败不影响创建结果
    }
    return repository;
  }

  @Get()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @ApiOperation({ summary: 'List repositories' })
  async findAll(@Req() req: Request, @Query() query: RepositoryQueryDto) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.findAll(userId, {
      isActive: query.isActive,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search public repositories' })
  async search(@Query('q') query: string, @Query('page') page?: number) {
    if (!query) {
      return [];
    }
    return this.repositoryService.searchRepositories(query, page);
  }

  @Get('my-repos')
  @ApiOperation({ summary: 'List my contributor repositories' })
  async getMyRepos(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findGithubCredentials(userId);
    if (!user?.githubAccessToken) {
      return { error: 'GitHub account is not connected. Configure a GitHub token in Settings > Integrations.' };
    }
    return this.repositoryService.searchUserRepositories(
      userId,
      user.githubAccessToken,
      user.githubRefreshToken || undefined,
      user.githubLogin || undefined,
    );
  }

  @Get('starred')
  @ApiOperation({ summary: 'List my starred repositories' })
  async getStarred(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findGithubCredentials(userId);
    if (!user?.githubAccessToken) {
      return { error: 'GitHub account is not connected. Configure a GitHub token in Settings > Integrations.' };
    }
    return this.repositoryService.searchStarredRepositories(
      userId,
      user.githubAccessToken,
      user.githubRefreshToken || undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get repository details' })
  async findById(@Req() req: Request, @Param('id') id: string): Promise<any> {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.findById(userId, id);
  }

  @Get(':id/branches')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @ApiOperation({ summary: 'Get repository branches' })
  async getBranches(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.getBranches(userId, id);
  }

  @Get(':id/contributors')
  @ApiOperation({ summary: 'Get repository contributors' })
  async getContributors(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findGithubCredentials(userId);
    return this.repositoryService.getContributors(id, user?.githubAccessToken || undefined);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update repository' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateRepositoryDto) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.updateForUser(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete repository' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    await this.repositoryService.delete(userId, id);
    return { success: true };
  }

  @Post(':id/sync')
  @HttpCode(202)
  @ApiOperation({ summary: 'Enqueue repository history sync (async)' })
  async sync(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    const job = await this.syncQueue.add('sync', {
      repositoryId: id,
      userId,
    });
    // 入队即下发首帧进度，进度条立即出现，弥补 worker 拉起到首次 stage 广播间的 1-5s 延迟
    try {
      this.eventGateway.broadcastRepositorySyncProgress({
        repositoryId: id,
        jobId: String(job.id),
        progress: 0,
        stage: 'commits',
      });
    } catch {
      // 实时广播为尽力而为，失败不影响入队结果
    }
    return { status: 'queued' as const, jobId: job.id };
  }

  @Post(':id/webhook')
  @ApiOperation({ summary: 'Recreate webhook on GitHub for this repository' })
  async registerWebhook(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.retryWebhook(userId, id);
  }

  @Post('batch-retry-webhooks')
  @ApiOperation({ summary: 'Re-register webhook for every active repo where caller is ADMIN' })
  async batchRetryWebhooks(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.batchRetryWebhooks(userId);
  }

  @Get(':id/webhook')
  @ApiOperation({ summary: 'Get repository webhook status (live-checked against GitHub)' })
  async getWebhookStatus(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.getWebhookStatus(userId, id);
  }

  @Post(':id/webhook/retry')
  @ApiOperation({ summary: 'Recreate webhook on GitHub for this repository' })
  async retryWebhook(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.retryWebhook(userId, id);
  }

  @Post(':id/webhook/test')
  @ApiOperation({ summary: 'Ask GitHub to redeliver a ping event for this webhook' })
  async testWebhook(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.testWebhook(userId, id);
  }

  @Post(':id/pulls/:number/merge')
  @ApiOperation({ summary: 'Merge a pull request on GitHub' })
  async mergePullRequest(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('number') number: string,
  ) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.mergePullRequest(userId, id, Number(number));
  }
}
