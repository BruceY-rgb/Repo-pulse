import { Controller, Get, Post, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService, AIProvider } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('设置')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
}
