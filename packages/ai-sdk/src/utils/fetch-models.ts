/**
 * AI 模型拉取
 *
 * 从各提供商的 API 拉取可用模型列表。
 */

import type { ProviderType } from '../interfaces/ai-provider';
import { PROVIDER_DEFAULT_URLS } from '../interfaces/ai-provider';
import { OpenAICompatibleProvider } from '../providers/openai-compatible';
import { AnthropicProvider } from '../providers/anthropic';
import { GeminiProvider } from '../providers/gemini';

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
 * 从供应商拉取模型列表
 *
 * @param provider 提供商类型
 * @param apiKey API Key
 * @param baseUrl Base URL（可选，默认使用预设）
 */
export async function fetchModels(
  provider: ProviderType,
  apiKey: string,
  baseUrl?: string
): Promise<FetchModelsResult> {
  const url = baseUrl || PROVIDER_DEFAULT_URLS[provider];

  try {
    switch (provider) {
      case 'anthropic': {
        // Anthropic 使用特殊的 API
        const response = await fetch(`${url}/v1/models`, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return {
            success: false,
            message: `拉取失败 (${response.status}): ${text.slice(0, 200)}`,
            models: [],
          };
        }

        const data = await response.json() as { data?: { id: string; display_name?: string }[] };
        const models: ModelInfo[] = (data.data || []).map((item) => ({
          id: item.id,
          name: item.display_name || item.id,
          enabled: true,
        }));

        return {
          success: true,
          message: `成功获取 ${models.length} 个模型`,
          models,
        };
      }

      case 'google': {
        // Google 使用特殊的 API 格式
        const response = await fetch(`${url}/v1beta/models?key=${apiKey}`, {
          method: 'GET',
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return {
            success: false,
            message: `拉取失败 (${response.status}): ${text.slice(0, 200)}`,
            models: [],
          };
        }

        const data = await response.json() as { models?: { name: string; displayName?: string }[] };
        // 过滤仅返回支持 generateContent 的模型
        const models: ModelInfo[] = (data.models || [])
          .filter((m) => m.name.includes('generateContent'))
          .map((item) => ({
            id: item.name.replace('models/', ''),
            name: item.displayName || item.name.replace('models/', ''),
            enabled: true,
          }));

        return {
          success: true,
          message: `成功获取 ${models.length} 个模型`,
          models,
        };
      }

      case 'openai':
      case 'deepseek':
      case 'moonshot':
      case 'zhipu':
      case 'minimax':
      case 'doubao':
      case 'qwen':
      case 'custom': {
        // OpenAI 兼容格式
        const response = await fetch(`${url}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return {
            success: false,
            message: `拉取失败 (${response.status}): ${text.slice(0, 200)}`,
            models: [],
          };
        }

        const data = await response.json() as { data?: { id: string }[] };
        const models: ModelInfo[] = (data.data || []).map((item) => ({
          id: item.id,
          name: item.id,
          enabled: true,
        }));

        // 按 ID 字母排序
        models.sort((a, b) => a.id.localeCompare(b.id));

        return {
          success: true,
          message: `成功获取 ${models.length} 个模型`,
          models,
        };
      }

      default:
        return {
          success: false,
          message: `不支持的提供商: ${provider}`,
          models: [],
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return {
      success: false,
      message: `拉取失败: ${message}`,
      models: [],
    };
  }
}