/**
 * AI 提供商图标映射
 *
 * 根据提供商类型获取对应的品牌图标。
 */

import type { AIProvider } from '@/services/settings.service';

// ===== 提供商图标导入 =====

import DefaultLogo from '@/assets/models/default.png';

import ClaudeLogo from '@/assets/models/claude.png';
import OpenAILogo from '@/assets/models/openai.png';
import DeepSeekLogo from '@/assets/models/deepseek.png';
import GeminiLogo from '@/assets/models/gemini.png';
import MoonshotLogo from '@/assets/models/moonshot.png';
import ZhipuLogo from '@/assets/models/zhipu.png';
import MiniMaxLogo from '@/assets/models/minimax.png';
import DoubaoLogo from '@/assets/models/doubao.png';
import QwenLogo from '@/assets/models/qwen.png';
import OllamaLogo from '@/assets/models/llama.png';

/**
 * 提供商 Logo 映射
 */
export const PROVIDER_LOGO_MAP: Record<AIProvider, string> = {
  anthropic: ClaudeLogo,
  openai: OpenAILogo,
  deepseek: DeepSeekLogo,
  google: GeminiLogo,
  moonshot: MoonshotLogo,
  zhipu: ZhipuLogo,
  minimax: MiniMaxLogo,
  doubao: DoubaoLogo,
  qwen: QwenLogo,
  ollama: OllamaLogo,
  custom: DefaultLogo,
};

/**
 * 根据提供商类型获取 Logo
 */
export function getProviderLogo(provider: AIProvider): string {
  return PROVIDER_LOGO_MAP[provider] ?? DefaultLogo;
}

export { DefaultLogo };
