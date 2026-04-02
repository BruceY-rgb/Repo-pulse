/**
 * AI 提供商类型定义
 */
export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'google'
  | 'moonshot'
  | 'zhipu'
  | 'minimax'
  | 'doubao'
  | 'qwen'
  | 'custom';

/**
 * 各提供商的默认 Base URL
 */
export const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  google: 'https://generativelanguage.googleapis.com',
  moonshot: 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  custom: '',
};

/**
 * 提供商显示名称
 */
export const PROVIDER_LABELS: Record<ProviderType, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  google: 'Google Gemini',
  moonshot: 'Moonshot / Kimi',
  zhipu: '智谱 AI',
  minimax: 'MiniMax',
  doubao: '豆包',
  qwen: '通义千问',
  custom: 'OpenAI 兼容格式',
};

/**
 * AI 提供商统一接口
 * 所有模型提供商（OpenAI、Anthropic、Ollama）必须实现此接口
 */
export interface AIProvider {
  readonly name: string;
  /** 渠道标识符 */
  readonly channelId: string;
  /** 渠道显示名称 */
  readonly displayName: string;

  /** 同步分析（等待完整结果） */
  analyze(input: AnalysisInput): Promise<AnalysisOutput>;

  /** 流式分析（逐步返回结果） */
  analyzeStream(input: AnalysisInput): AsyncIterable<StreamChunk>;

  /** 检查提供商是否可用（API Key 有效、服务可达） */
  isAvailable(): Promise<boolean>;
}

export interface AnalysisInput {
  eventType: string;
  title: string;
  body: string;
  diff?: string;
  comments?: string[];
  context?: Record<string, unknown>;
  language?: 'zh' | 'en';
  maxTokens?: number;
  temperature?: number;
}

export interface AnalysisOutput {
  summary: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskReason?: string;
  categories: string[];
  keyChanges: string[];
  suggestions: Suggestion[];
  tokensUsed: number;
  latencyMs: number;
}

export interface Suggestion {
  type: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AIProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  provider?: ProviderType;
  timeout?: number;
  maxRetries?: number;
}
