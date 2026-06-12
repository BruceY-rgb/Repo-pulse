import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService, AIProvider } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SyncService } from '../sync/sync.service';

@ApiTags('设置')
@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

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
    this.startGithubSync(user.sub);
    return { ...result, sync: { status: 'pending' as const } };
  }

  /**
   * Token 保存后后台同步仓库。
   * 同步可能触发 GitHub 多页拉取、webhook 创建和分支同步，不能阻塞保存请求；
   * 否则仓库多或网络慢时容易撞上前端/API 30s 超时，被误报为 token 保存失败。
   */
  private startGithubSync(userId: string): void {
    const syncPromise = this.syncService.syncUserRepositories(userId, { throwOnFetchError: true });
    syncPromise.then(
      ({ synced, starred }) => {
        this.logger.log(
          `github_token_background_sync_completed userId=${userId} synced=${synced} starred=${starred}`,
        );
      },
      (error) => {
        this.logger.warn(
          `github_token_background_sync_failed userId=${userId} ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );
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
