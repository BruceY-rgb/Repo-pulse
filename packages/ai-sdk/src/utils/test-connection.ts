/**
 * AI 连接测试
 *
 * 根据提供商类型执行不同的连接测试。
 */

import type { ProviderType } from '../interfaces/ai-provider';
import { PROVIDER_DEFAULT_URLS } from '../interfaces/ai-provider';
import { OpenAICompatibleProvider } from '../providers/openai-compatible';
import { AnthropicProvider } from '../providers/anthropic';
import { GeminiProvider } from '../providers/gemini';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

/**
 * 测试 AI 连接
 *
 * @param provider 提供商类型
 * @param apiKey API Key
 * @param baseUrl Base URL（可选，默认使用预设）
 */
export async function testConnection(
  provider: ProviderType,
  apiKey: string,
  baseUrl?: string
): Promise<ConnectionTestResult> {
  const url = baseUrl || PROVIDER_DEFAULT_URLS[provider];

  try {
    switch (provider) {
      case 'anthropic': {
        const anthropicProvider = new AnthropicProvider({
          apiKey,
          baseUrl: url,
          model: 'claude-sonnet-4-20250514',
        });
        const available = await anthropicProvider.isAvailable();
        return {
          success: available,
          message: available ? '连接成功' : '连接失败',
        };
      }

      case 'google': {
        const geminiProvider = new GeminiProvider({
          apiKey,
          baseUrl: url,
          model: 'gemini-2.0-flash-exp',
        });
        const available = await geminiProvider.isAvailable();
        return {
          success: available,
          message: available ? '连接成功' : '连接失败',
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
        const openaiProvider = new OpenAICompatibleProvider({
          apiKey,
          baseUrl: url,
          model: 'gpt-4o',
        });
        const available = await openaiProvider.isAvailable();
        return {
          success: available,
          message: available ? '连接成功' : '连接失败',
        };
      }

      default:
        return {
          success: false,
          message: `不支持的提供商: ${provider}`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    return {
      success: false,
      message: `连接失败: ${message}`,
    };
  }
}