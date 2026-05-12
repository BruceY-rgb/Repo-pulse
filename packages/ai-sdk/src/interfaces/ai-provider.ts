/**
 * AI 提供商类型定义
 * Provider 类型/常量的唯一数据源为 @repo-pulse/shared
 */

// 重新导出共享类型（保持向后兼容的 ProviderType 别名）
export type { AIProvider as ProviderType } from '@repo-pulse/shared';
export { PROVIDER_DEFAULT_URLS, PROVIDER_LABELS } from '@repo-pulse/shared';

/**
 * AI 提供商统一接口
 * 所有模型提供商（OpenAI、Anthropic、Gemini 等）必须实现此接口
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
  // 旧字段保留
  summary: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskReason?: string;
  categories: string[];
  keyChanges: string[];
  suggestions: Suggestion[];
  tokensUsed: number;
  latencyMs: number;

  // 新增丰富字段（全部可选，保证向后兼容）
  summaryShort?: string;
  summaryLong?: string;
  category?: string;
  riskScore?: number;
  riskReasons?: string[];
  tags?: string[];
  affectedAreas?: string[];
  impactSummary?: string;
  suggestedAction?: string;
  confidence?: number;
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
  provider?: import('@repo-pulse/shared').AIProvider;
  timeout?: number;
  maxRetries?: number;
}
