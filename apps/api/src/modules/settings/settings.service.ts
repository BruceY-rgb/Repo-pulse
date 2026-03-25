import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@repo-pulse/database';

export type AIProvider = 'openai' | 'anthropic' | 'ollama' | 'custom';

export interface AIConfig {
  aiProvider?: AIProvider;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
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
}
