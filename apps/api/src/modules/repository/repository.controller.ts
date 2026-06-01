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
import { RepositoryService } from './repository.service';
import { UserService } from '../user/user.service';
import {
  CreateRepositoryDto,
  UpdateRepositoryDto,
  RepositoryQueryDto,
  RepositorySyncSummaryDto,
} from './dto/repository.dto';
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
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create repository' })
  async create(@Req() req: Request, @Body() dto: CreateRepositoryDto) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findById(userId);
    return this.repositoryService.create(userId, dto, {
      userOAuthToken: user?.githubAccessToken || undefined,
    });
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
    const user = await this.userService.findById(userId);
    if (!user?.githubAccessToken) {
      return { error: 'GitHub account not connected, please log in again' };
    }
    return this.repositoryService.searchUserRepositories(
      userId,
      user.githubAccessToken,
      user.githubRefreshToken,
      user.githubLogin,
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
      userId,
      user.githubAccessToken,
      user.githubRefreshToken,
    );
  }

  @Post('batch-retry-webhooks')
  @ApiOperation({ summary: 'Re-register webhooks for editable active repositories' })
  async batchRetryWebhooks(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.batchRetryWebhooks(userId);
  }

  @Get(':id/webhook')
  @ApiOperation({ summary: 'Get repository webhook status' })
  async getWebhookStatus(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.getWebhookStatus(userId, id);
  }

  @Post(':id/webhook/retry')
  @ApiOperation({ summary: 'Recreate repository webhook' })
  async retryWebhook(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.retryWebhook(userId, id);
  }

  @Post(':id/webhook/test')
  @HttpCode(202)
  @ApiOperation({ summary: 'Ask provider to send a webhook ping event' })
  async testWebhook(@Req() req: Request, @Param('id') id: string) {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.testWebhook(userId, id);
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
    const user = await this.userService.findById(userId);
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
  @ApiOperation({ summary: 'Sync repository history' })
  async sync(@Req() req: Request, @Param('id') id: string): Promise<RepositorySyncSummaryDto> {
    const userId = (req.user as { sub: string }).sub;
    return this.repositoryService.syncForUser(userId, id);
  }

  @Post(':id/webhook')
  @ApiOperation({ summary: '重新注册 Webhook' })
  async registerWebhook(@Req() req: Request, @Param('id') id: string): Promise<any> {
    const userId = (req.user as { sub: string }).sub;
    const repository = await this.repositoryService.registerWebhook(userId, id);
    return repository;
  }
}
