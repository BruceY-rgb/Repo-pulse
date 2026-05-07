import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService, AIProvider } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

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
}
