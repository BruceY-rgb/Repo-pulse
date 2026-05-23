import { apiClient } from './api-client';
import type { ApiResponse } from '@/types/api';
import type { AIProvider, AIConfig, ConnectionTestResult, ModelInfo } from '@repo-pulse/shared';
import {
  PROVIDER_LABELS,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_DEFAULT_URLS,
  PROVIDER_CHAT_PATHS,
} from '@repo-pulse/shared';

// Re-export from shared for page-level consumers
export type { AIProvider, AIConfig, ConnectionTestResult, ModelInfo };
export { PROVIDER_LABELS, PROVIDER_DEFAULT_MODELS, PROVIDER_DEFAULT_URLS, PROVIDER_CHAT_PATHS };

export interface FetchModelsResult {
  success: boolean;
  message: string;
  models: ModelInfo[];
}

export type AppConfigSource = 'db' | 'env' | 'default';

export interface ApiUrlConfig {
  value: string;
  source: AppConfigSource;
}

export interface BatchRetryWebhooksResult {
  total: number;
  succeeded: number;
  failed: number;
  failures: Array<{
    repositoryId: string;
    fullName: string;
    status: string;
    error?: string;
  }>;
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

  /**
   * 测试 AI 连接
   */
  async testConnection(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string
  ): Promise<ConnectionTestResult> {
    const { data } = await apiClient.post<ApiResponse<ConnectionTestResult>>('/settings/ai/test', {
      provider,
      apiKey,
      baseUrl,
    });
    return data.data;
  },

  /**
   * 拉取 AI 模型列表
   */
  async fetchModels(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string
  ): Promise<FetchModelsResult> {
    const { data } = await apiClient.post<ApiResponse<FetchModelsResult>>('/settings/ai/models', {
      provider,
      apiKey,
      baseUrl,
    });
    return data.data;
  },

  /**
   * 读取 webhook API_URL 当前值 + 来源
   */
  async getApiUrlConfig(): Promise<ApiUrlConfig> {
    const { data } = await apiClient.get<ApiResponse<ApiUrlConfig>>('/settings/app-config/api-url');
    return data.data;
  },

  /**
   * 更新 webhook API_URL（需要 ADMIN role）
   */
  async updateApiUrlConfig(value: string): Promise<ApiUrlConfig> {
    const { data } = await apiClient.post<ApiResponse<ApiUrlConfig>>(
      '/settings/app-config/api-url',
      { value },
    );
    return data.data;
  },

  /**
   * 批量重建用户作为 ADMIN 的所有 active 仓库 webhook
   */
  async batchRetryWebhooks(): Promise<BatchRetryWebhooksResult> {
    const { data } = await apiClient.post<ApiResponse<BatchRetryWebhooksResult>>(
      '/repositories/batch-retry-webhooks',
    );
    return data.data;
  },
};
