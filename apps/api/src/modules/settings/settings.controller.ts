import { Controller, Delete, Get, Post, Put, Body, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { GithubTokenSyncSummary } from '@repo-pulse/shared';
import { SettingsService, AIProvider } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SyncService } from '../sync/sync.service';

@ApiTags('设置')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly syncService: SyncService,
  ) {}

  /**
   * 获取当前用户的 AI 配置
   */
  @Get('ai')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取 AI 配置' })
  async getAIConfig(@CurrentUser() user: { sub: string }) {
    return this.settingsService.getAIConfig(user.sub);
  }

  /**
   * 获取原始 AI 配置 (含解密 API Key)
   */
  @Get('ai/raw')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '获取原始 AI 配置 (含解密 API Key)' })
  async getRawAIConfig(@CurrentUser() user: { sub: string }) {
    const config = await this.settingsService.getAIConfig(user.sub);
    const rawApiKey = await this.settingsService.resolveApiKey(user.sub, '***');
    return {
      ...config,
      aiApiKey: rawApiKey,
    };
  }


  /**
   * 更新当前用户的 AI 配置
   */
  @Post('ai')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '更新 AI 配置' })
  async updateAIConfig(
    @CurrentUser() user: { sub: string },
    @Body()
    body: {
      aiProvider?: AIProvider;
      aiApiKey?: string;
      aiBaseUrl?: string;
      aiModel?: string;
    },
  ) {
    return this.settingsService.updateAIConfig(user.sub, body);
  }

  /**
   * 测试 AI 连接（支持掩码 key 回退到已存储 key）
   */
  @Post('ai/test')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '测试 AI 连接' })
  async testConnection(
    @CurrentUser() user: { sub: string },
    @Body()
    body: {
      provider: AIProvider;
      apiKey: string;
      baseUrl?: string;
    },
  ) {
    const apiKey = await this.settingsService.resolveApiKey(user.sub, body.apiKey);
    return this.settingsService.testConnection(body.provider, apiKey, body.baseUrl);
  }

  /**
   * 拉取 AI 模型列表（支持掩码 key 回退到已存储 key）
   */
  @Post('ai/models')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '拉取 AI 模型列表' })
  async fetchModels(
    @CurrentUser() user: { sub: string },
    @Body()
    body: {
      provider: AIProvider;
      apiKey: string;
      baseUrl?: string;
    },
  ) {
    const apiKey = await this.settingsService.resolveApiKey(user.sub, body.apiKey);
    return this.settingsService.fetchModels(body.provider, apiKey, body.baseUrl);
  }

  /**
   * 读取当前 webhook API_URL（DB → env → default 三层来源）
   */
  @Get('app-config/api-url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '读取 webhook API_URL 配置' })
  async getApiUrlConfig() {
    return this.settingsService.getApiUrlConfig();
  }

  /**
   * 更新 webhook API_URL（仅 ADMIN）
   */
  @Post('app-config/api-url')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '更新 webhook API_URL（ADMIN）' })
  async updateApiUrlConfig(
    @CurrentUser() user: { sub: string; role?: string },
    @Body() body: { value: string },
  ) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required');
    }
    const value = body?.value?.trim();
    if (!value || !/^https?:\/\//i.test(value)) {
      throw new ForbiddenException('API_URL must start with http:// or https://');
    }
    return this.settingsService.updateApiUrlConfig(user.sub, value);
  }

  @Get('integrations/github')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '读取 GitHub token 集成状态' })
  async getGithubIntegration(@CurrentUser() user: { sub: string }) {
    return this.settingsService.getGithubIntegrationStatus(user.sub);
  }

  @Put('integrations/github-token')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '配置 GitHub Personal Access Token' })
  async updateGithubToken(
    @CurrentUser() user: { sub: string },
    @Body() body: { token?: string },
  ) {
    const token = body.token?.trim();
    if (!token) {
      throw new BadRequestException('GitHub token is required');
    }
    const result = await this.settingsService.updateGithubToken(user.sub, token);
    const sync = await this.runSyncBounded(user.sub);
    return { ...result, sync };
  }

  /**
   * Token 保存后立刻同步仓库，但最多等待 SYNC_WAIT_MS。
   * 预算：前端 axios 与服务端全局 TimeoutInterceptor 均为 30s，
   * 前置的 GitHub profile 校验最多占 10s（settings.service 已设超时），故等待上限取 15s。
   * 超时后同步继续在后台进行，响应标记 pending；同步异常不影响 token 保存结果。
   */
  private async runSyncBounded(userId: string): Promise<GithubTokenSyncSummary> {
    const SYNC_WAIT_MS = 15_000;
    const syncPromise = this.syncService.syncUserRepositories(userId, { throwOnFetchError: true });
    syncPromise.catch(() => undefined);

    let timer: NodeJS.Timeout | undefined;
    const sync = await Promise.race<GithubTokenSyncSummary>([
      syncPromise.then(
        ({ synced, starred }) => ({ status: 'completed' as const, synced, starred }),
        () => ({ status: 'failed' as const }),
      ),
      new Promise<GithubTokenSyncSummary>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'pending' }), SYNC_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    return sync;
  }

  @Post('integrations/github/test')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '测试当前 GitHub token' })
  async testGithubIntegration(@CurrentUser() user: { sub: string }) {
    return this.settingsService.testGithubIntegration(user.sub);
  }

  @Delete('integrations/github-token')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '断开 GitHub token 集成' })
  async disconnectGithub(@CurrentUser() user: { sub: string }) {
    return this.settingsService.disconnectGithub(user.sub);
  }
}
