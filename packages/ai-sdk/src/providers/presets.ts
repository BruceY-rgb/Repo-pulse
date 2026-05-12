/**
 * AI 提供商预设配置
 *
 * 各提供商的默认配置信息，包含 Base URL 和默认模型。
 */

import type { ProviderType } from '../interfaces/ai-provider';

export interface ProviderPreset {
  /** 渠道标识符 */
  channelId: string;
  /** 渠道显示名称 */
  displayName: string;
  /** API Base URL */
  baseUrl: string;
  /** 默认模型 */
  defaultModel: string;
}

/**
 * 各提供商预设配置
 */
export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  anthropic: {
    channelId: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  openai: {
    channelId: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
  },
  deepseek: {
    channelId: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultModel: 'deepseek-chat',
  },
  google: {
    channelId: 'google',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.0-flash-exp',
  },
  moonshot: {
    channelId: 'moonshot',
    displayName: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-longtext-chat',
  },
  zhipu: {
    channelId: 'zhipu',
    displayName: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
  },
  minimax: {
    channelId: 'minimax',
    displayName: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-M2.1',
  },
  doubao: {
    channelId: 'doubao',
    displayName: '豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-pro-32k',
  },
  qwen: {
    channelId: 'qwen',
    displayName: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
  },
  custom: {
    channelId: 'custom',
    displayName: 'OpenAI 兼容格式',
    baseUrl: '',
    defaultModel: '',
  },
};

/**
 * 根据 provider 类型获取预设配置
 */
export function getPreset(provider: ProviderType): ProviderPreset {
  return PROVIDER_PRESETS[provider];
}