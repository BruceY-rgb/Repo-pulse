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
import {
  CreateRepositoryDto,
  UpdateRepositoryDto,
  RepositoryQueryDto,
} from './dto/repository.dto';
import type { RepositorySyncJob } from './repository-sync.processor';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('Repository Management')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('repositories')
export class RepositoryController {
  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly userService: UserService,
    @InjectQueue(QUEUE_NAMES.REPOSITORY_SYNC)
    private readonly syncQueue: Queue<RepositorySyncJob>,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create repository' })
  async create(@Req() req: Request, @Body() dto: CreateRepositoryDto) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.create(userId, dto);
  }

  @Get()
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
    const user = await this.userService.findById(userId);
    if (!user?.githubAccessToken) {
      return { error: 'GitHub account not connected, please log in again' };
    }
    return this.repositoryService.searchUserRepositories(
      user.githubAccessToken,
      user.githubRefreshToken,
    );
  }

  @Get('starred')
  @ApiOperation({ summary: 'List my starred repositories' })
  async getStarred(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findById(userId);
    if (!user?.githubAccessToken) {
      return { error: 'GitHub account not connected, please log in again' };
    }
    return this.repositoryService.searchStarredRepositories(
      user.githubAccessToken,
      user.githubRefreshToken,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get repository details' })
  async findById(@Param('id') id: string): Promise<any> {
    return this.repositoryService.findById(id);
  }

  @Get(':id/branches')
  @ApiOperation({ summary: 'Get repository branches' })
  async getBranches(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.getBranches(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update repository' })
  async update(@Param('id') id: string, @Body() dto: UpdateRepositoryDto) {
    return this.repositoryService.update(id, dto);
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
    return { status: 'queued' as const, jobId: job.id };
  }
}
