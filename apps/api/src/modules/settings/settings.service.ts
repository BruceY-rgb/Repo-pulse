import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@repo-pulse/database';

export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'deepseek'
  | 'google'
  | 'moonshot'
  | 'zhipu'
  | 'minimax'
  | 'doubao'
  | 'qwen'
  | 'custom';

export interface AIConfig {
  aiProvider?: AIProvider;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  enabled: boolean;
}

export interface FetchModelsResult {
  success: boolean;
  message: string;
  models: ModelInfo[];
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  /**
   * 获取当前用户的 AI 配置
   */
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

    // 不返回 API Key 的明文
    return {
      aiProvider: user.aiProvider as AIProvider | undefined,
      aiApiKey: user.aiApiKey ? '***' : undefined,
      aiBaseUrl: user.aiBaseUrl || undefined,
      aiModel: user.aiModel || undefined,
    };
  }

  /**
   * 更新当前用户的 AI 配置
   */
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

    // 如果提供了新的 API Key，则更新；否则保持原值
    if (config.aiApiKey !== undefined) {
      if (config.aiApiKey === '***' || config.aiApiKey === '') {
        // 保留原 API Key，不更新
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
   * 测试 AI 连接
   */
  async testConnection(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
  ): Promise<ConnectionTestResult> {
    // 动态导入 ai-sdk，避免循环依赖
    const { testConnection: test } = await import('@repo-pulse/ai-sdk');
    return test(provider, apiKey, baseUrl);
  }

  /**
   * 拉取 AI 模型列表
   */
  async fetchModels(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
  ): Promise<FetchModelsResult> {
    const { fetchModels: fetch } = await import('@repo-pulse/ai-sdk');
    return fetch(provider, apiKey, baseUrl);
  }
}
