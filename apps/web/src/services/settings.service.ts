import { apiClient } from './api-client';
import type { ApiResponse } from '@/types/api';

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

/**
 * 提供商显示名称
 */
export const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama (本地)',
  deepseek: 'DeepSeek',
  google: 'Google Gemini',
  moonshot: 'Moonshot / Kimi',
  zhipu: '智谱 AI',
  minimax: 'MiniMax',
  doubao: '豆包',
  qwen: '通义千问',
  custom: '自定义端点',
};

/**
 * 提供商默认模型
 */
export const PROVIDER_DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  ollama: 'llama3',
  deepseek: 'deepseek-chat',
  google: 'gemini-2.0-flash-exp',
  moonshot: 'kimi-longtext-chat',
  zhipu: 'glm-4-flash',
  minimax: 'MiniMax-M2.1',
  doubao: 'doubao-pro-32k',
  qwen: 'qwen-turbo',
  custom: '',
};

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
};
