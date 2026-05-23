import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@repo-pulse/database';
import type { AIProvider, AIConfig, ConnectionTestResult, ModelInfo } from '@repo-pulse/shared';
import { AppConfigService } from '../app-config/app-config.service';

const API_URL_FALLBACK = 'http://localhost:3001';

// Re-export for backward compatibility
export type { AIProvider, AIConfig, ConnectionTestResult, ModelInfo } from '@repo-pulse/shared';

export interface FetchModelsResult {
  success: boolean;
  message: string;
  models: ModelInfo[];
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly appConfigService: AppConfigService) {}

  /**
   * 读取当前 webhook API_URL，附带来源标识
   */
  async getApiUrlConfig(): Promise<{ value: string; source: 'db' | 'env' | 'default' }> {
    const resolved = await this.appConfigService.resolve('API_URL', API_URL_FALLBACK);
    return resolved ?? { value: API_URL_FALLBACK, source: 'default' };
  }

  /**
   * 更新 webhook API_URL 持久化到 DB
   */
  async updateApiUrlConfig(
    userId: string,
    value: string,
  ): Promise<{ value: string; source: 'db' }> {
    await this.appConfigService.set('API_URL', value, userId);
    return { value, source: 'db' };
  }

  async getAIConfig(userId: string): Promise<AIConfig> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        aiProvider: true,
        aiApiKey: true,
        aiBaseUrl: true,
        aiModel: true,
      },
    });

    if (!user) {
      this.logger.warn(`User not found: ${userId}`);
      return {};
    }

    return {
      aiProvider: user.aiProvider as AIProvider | undefined,
      aiApiKey: user.aiApiKey ? '***' : undefined,
      aiBaseUrl: user.aiBaseUrl || undefined,
      aiModel: user.aiModel || undefined,
    };
  }

  async updateAIConfig(
    userId: string,
    config: {
      aiProvider?: AIProvider;
      aiApiKey?: string;
      aiBaseUrl?: string;
      aiModel?: string;
    },
  ): Promise<AIConfig> {
    const updateData: Record<string, unknown> = {};

    if (config.aiProvider !== undefined) {
      updateData.aiProvider = config.aiProvider;
    }

    if (config.aiApiKey !== undefined) {
      if (config.aiApiKey === '***' || config.aiApiKey === '') {
      } else {
        updateData.aiApiKey = config.aiApiKey;
      }
    }

    if (config.aiBaseUrl !== undefined) {
      updateData.aiBaseUrl = config.aiBaseUrl || null;
    }

    if (config.aiModel !== undefined) {
      updateData.aiModel = config.aiModel || null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        aiProvider: true,
        aiApiKey: true,
        aiBaseUrl: true,
        aiModel: true,
      },
    });

    this.logger.log(`AI config updated for user: ${userId}`);

    return {
      aiProvider: updatedUser.aiProvider as AIProvider | undefined,
      aiApiKey: updatedUser.aiApiKey ? '***' : undefined,
      aiBaseUrl: updatedUser.aiBaseUrl || undefined,
      aiModel: updatedUser.aiModel || undefined,
    };
  }

  /**
   * 解析实际 API Key。
   * 如果前端传来掩码 '***'，从数据库读取真实 key；否则使用传入值。
   */
  async resolveApiKey(userId: string, apiKey: string): Promise<string> {
    if (apiKey === '***') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiApiKey: true },
      });
      return user?.aiApiKey || '';
    }
    return apiKey;
  }

  // @ts-ignore
  async testConnection(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
  ): Promise<ConnectionTestResult> {
    // @ts-ignore
    const { testConnection: test } = await import('@repo-pulse/ai-sdk');
    return test(provider, apiKey, baseUrl);
  }

  // @ts-ignore
  async fetchModels(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
  ): Promise<FetchModelsResult> {
    // @ts-ignore
    const { fetchModels: fetch } = await import('@repo-pulse/ai-sdk');
    return fetch(provider, apiKey, baseUrl);
  }
}