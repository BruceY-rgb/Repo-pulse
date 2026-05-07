/**
 * 提供商便捷创建函数
 *
 * 提供各提供商的快速创建方法。
 */

import type { AIProvider, AIProviderConfig, ProviderType } from '../interfaces/ai-provider';
import { PROVIDER_PRESETS, type ProviderPreset } from './presets';
import { AnthropicProvider } from './anthropic';
import { OpenAICompatibleProvider } from './openai-compatible';
import { GeminiProvider } from './gemini';

/**
 * 创建 DeepSeek Provider
 */
export function createDeepSeekProvider(
  apiKey: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider {
  const preset = PROVIDER_PRESETS.deepseek;
  return new OpenAICompatibleProvider(
    {
      apiKey,
      baseUrl: preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
      ...options,
    },
    preset
  );
}

/**
 * 创建 MiniMax Provider
 */
export function createMiniMaxProvider(
  apiKey: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider {
  const preset = PROVIDER_PRESETS.minimax;
  return new OpenAICompatibleProvider(
    {
      apiKey,
      baseUrl: preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
      ...options,
    },
    preset
  );
}

/**
 * 创建 Moonshot/Kimi Provider
 */
export function createMoonshotProvider(
  apiKey: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider {
  const preset = PROVIDER_PRESETS.moonshot;
  return new OpenAICompatibleProvider(
    {
      apiKey,
      baseUrl: preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
      ...options,
    },
    preset
  );
}

/**
 * 创建智谱 AI Provider
 */
export function createZhipuProvider(
  apiKey: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider {
  const preset = PROVIDER_PRESETS.zhipu;
  return new OpenAICompatibleProvider(
    {
      apiKey,
      baseUrl: preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
      ...options,
    },
    preset
  );
}

/**
 * 创建通义千问 Provider
 */
export function createTongyiProvider(
  apiKey: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider {
  const preset = PROVIDER_PRESETS.qwen;
  return new OpenAICompatibleProvider(
    {
      apiKey,
      baseUrl: preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
      ...options,
    },
    preset
  );
}

/**
 * 创建豆包 Provider
 */
export function createDoubaoProvider(
  apiKey: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider {
  const preset = PROVIDER_PRESETS.doubao;
  return new OpenAICompatibleProvider(
    {
      apiKey,
      baseUrl: preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
      ...options,
    },
    preset
  );
}

/**
 * 创建自定义 OpenAI 兼容 Provider
 */
export function createCustomProvider(
  apiKey: string,
  baseUrl: string,
  model: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider(
    {
      apiKey,
      baseUrl,
      model,
      ...options,
    },
    PROVIDER_PRESETS.custom
  );
}

/**
 * 根据 provider 类型创建 Provider
 */
export function createProvider(
  provider: Exclude<ProviderType, 'google' | 'anthropic' | 'deepseek'>,
  apiKey: string,
  options?: Partial<AIProviderConfig>
): OpenAICompatibleProvider;
export function createProvider(
  provider: 'google',
  apiKey: string,
  options?: Partial<AIProviderConfig>
): GeminiProvider;
export function createProvider(
  provider: 'anthropic' | 'deepseek',
  apiKey: string,
  options?: Partial<AIProviderConfig>
): AnthropicProvider;
export function createProvider(
  provider: ProviderType,
  apiKey: string,
  options?: Partial<AIProviderConfig>
): AIProvider;
export function createProvider(
  provider: ProviderType,
  apiKey: string,
  options?: Partial<AIProviderConfig>
): AIProvider {
  const preset = PROVIDER_PRESETS[provider];

  if (provider === 'anthropic' || provider === 'deepseek') {
    // DeepSeek 使用 Anthropic 兼容协议，baseUrl 指向其 /anthropic 端点
    const anthropicBaseUrl = provider === 'deepseek'
      ? 'https://api.deepseek.com/anthropic'
      : options?.baseUrl ?? preset.baseUrl;
    return new AnthropicProvider({
      apiKey,
      ...options,
      baseUrl: anthropicBaseUrl,
      model: options?.model ?? preset.defaultModel,
    });
  }

  if (provider === 'google') {
    return new GeminiProvider({
      apiKey,
      ...options,
      baseUrl: options?.baseUrl ?? preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
    });
  }

  return new OpenAICompatibleProvider(
    {
      apiKey,
      ...options,
      baseUrl: options?.baseUrl ?? preset.baseUrl,
      model: options?.model ?? preset.defaultModel,
    },
    preset
  );
}