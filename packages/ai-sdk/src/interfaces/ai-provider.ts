/**
 * AI 提供商统一接口
 * 所有模型提供商（OpenAI、Anthropic、Ollama）必须实现此接口
 */
export interface AIProvider {
  readonly name: string;

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
  timeout?: number;
  maxRetries?: number;
}
