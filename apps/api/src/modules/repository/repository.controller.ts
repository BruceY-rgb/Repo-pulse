import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RepositoryService } from './repository.service';
import { UserService } from '../user/user.service';
import { CreateRepositoryDto, UpdateRepositoryDto, RepositoryQueryDto } from './dto/repository.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';

@ApiTags('仓库管理')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('repositories')
export class RepositoryController {
  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly userService: UserService,
  ) {}

  @Post()
  @ApiOperation({ summary: '添加仓库' })
  async create(@Req() req: Request, @Body() dto: CreateRepositoryDto) {
    const userId = (req.user as { sub: string }).sub;
    const repository = await this.repositoryService.create(userId, dto);
    return repository;
  }

  @Get()
  @ApiOperation({ summary: '获取仓库列表' })
  async findAll(@Req() req: Request, @Query() query: RepositoryQueryDto) {
    const userId = (req.user as { sub: string }).sub;
    const repositories = await this.repositoryService.findAll(userId, {
      isActive: query.isActive,
    });
    return repositories;
  }

  @Get('search')
  @ApiOperation({ summary: '搜索公开仓库' })
  async search(@Query('q') query: string, @Query('page') page?: number) {
    if (!query) {
      return [];
    }
    const results = await this.repositoryService.searchRepositories(query, page);
    return results;
  }

  @Get('my-repos')
  @ApiOperation({ summary: '获取用户作为 contributor 的仓库' })
  async getMyRepos(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findById(userId);
    if (!user?.githubAccessToken) {
      return { error: '未绑定 GitHub 账号，请重新登录' };
    }
    const results = await this.repositoryService.searchUserRepositories(
      user.githubAccessToken,
      user.githubRefreshToken,
    );
    return results;
  }

  @Get('starred')
  @ApiOperation({ summary: '获取用户 star 的仓库' })
  async getStarred(@Req() req: Request) {
    const userId = (req.user as { sub: string }).sub;
    const user = await this.userService.findById(userId);
    if (!user?.githubAccessToken) {
      return { error: '未绑定 GitHub 账号，请重新登录' };
    }
    const results = await this.repositoryService.searchStarredRepositories(
      user.githubAccessToken,
      user.githubRefreshToken,
    );
    return results;
  }

  @Get(':id')
  @ApiOperation({ summary: '获取仓库详情' })
  async findById(@Param('id') id: string): Promise<any> {
    const repository = await this.repositoryService.findById(id);
    return repository;
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新仓库' })
  async update(@Param('id') id: string, @Body() dto: UpdateRepositoryDto) {
    const repository = await this.repositoryService.update(id, dto);
    return repository;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除仓库' })
  async delete(@Param('id') id: string) {
    await this.repositoryService.delete(id);
    return { success: true };
  }

  @Post(':id/sync')
  @ApiOperation({ summary: '同步仓库事件' })
  async sync(@Param('id') id: string): Promise<any> {
    const repository = await this.repositoryService.sync(id);
    return repository;
  }

  @Post(':id/webhook')
  @ApiOperation({ summary: '重新注册 Webhook' })
  async registerWebhook(@Param('id') id: string): Promise<any> {
    const repository = await this.repositoryService.registerWebhook(id);
    return repository;
  }
}
