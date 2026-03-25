import { apiClient } from './api-client';
import type { ApiResponse } from '@/types/api';

export type AIProvider = 'openai' | 'anthropic' | 'ollama' | 'custom';

export interface AIConfig {
  aiProvider?: AIProvider;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiModel?: string;
}

/**
 * 设置服务 - AI 配置
 */
export const settingsService = {
  /**
   * 获取当前用户的 AI 配置
   */
  async getAIConfig(): Promise<AIConfig> {
    const { data } = await apiClient.get<ApiResponse<AIConfig>>('/settings/ai');
    return data.data;
  },

  /**
   * 更新 AI 配置
   */
  async updateAIConfig(config: Partial<AIConfig>): Promise<AIConfig> {
    const { data } = await apiClient.post<ApiResponse<AIConfig>>('/settings/ai', config);
    return data.data;
  },
};
