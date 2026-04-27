/**
 * OpenAI 兼容 Provider
 *
 * 基于 OpenAI SDK，支持任意 OpenAI 兼容格式的 API 端点。
 * 适用于 DeepSeek、Moonshot、智谱、MiniMax、通义千问等。
 */

import OpenAI from 'openai';
import type {
  AIProvider,
  AIProviderConfig,
  AnalysisInput,
  AnalysisOutput,
  StreamChunk,
} from '../interfaces/ai-provider';
import { buildSystemPrompt, buildUserPrompt } from '../prompts';
import type { ProviderPreset } from './presets';

export class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible';
  readonly channelId: string;
  readonly displayName: string;

  private client: OpenAI;
  private model: string;

  constructor(config: AIProviderConfig, preset?: ProviderPreset) {
    this.channelId = preset?.channelId ?? 'custom';
    this.displayName = preset?.displayName ?? 'OpenAI 兼容格式';

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
    });
    this.model = config.model;
  }

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(input.language) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 2048,
      response_format: { type: 'json_object' },
    });

    const latencyMs = Date.now() - start;
    const content = response.choices[0]?.message?.content ?? '{}';

    try {
      const parsed = JSON.parse(content) as Omit<AnalysisOutput, 'tokensUsed' | 'latencyMs'>;
      return {
        ...parsed,
        tokensUsed: response.usage?.total_tokens ?? 0,
        latencyMs,
      };
    } catch {
      // 如果解析失败，返回空结果
      return {
        summary: content,
        riskLevel: 'LOW',
        categories: [],
        keyChanges: [],
        suggestions: [],
        tokensUsed: response.usage?.total_tokens ?? 0,
        latencyMs,
      };
    }
  }

  async *analyzeStream(input: AnalysisInput): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: buildSystemPrompt(input.language) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { type: 'text', content: delta };
      }
    }

    yield { type: 'done', content: '' };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 使用 /models 端点验证连接
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}