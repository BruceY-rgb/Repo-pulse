export * from './interfaces/ai-provider';
export { OpenAIProvider } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export { OllamaProvider } from './providers/ollama';
export { buildSystemPrompt, buildUserPrompt } from './prompts';

// 新增：预设配置
export * from './providers/presets';

// 新增：统一兼容 Provider
export { OpenAICompatibleProvider } from './providers/openai-compatible';

// 新增：Gemini Provider
export { GeminiProvider } from './providers/gemini';

// 新增：提供商便捷创建函数
export {
  createDeepSeekProvider,
  createMiniMaxProvider,
  createMoonshotProvider,
  createZhipuProvider,
  createTongyiProvider,
  createDoubaoProvider,
  createCustomProvider,
  createProvider,
} from './providers/index';

// 新增：连接测试和模型拉取
export { testConnection, type ConnectionTestResult } from './utils/test-connection';
export { fetchModels, type FetchModelsResult, type ModelInfo } from './utils/fetch-models';
