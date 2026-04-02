/**
 * Google Gemini Provider
 *
 * 使用 Google Generative AI SDK。
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIProvider,
  AIProviderConfig,
  AnalysisInput,
  AnalysisOutput,
  StreamChunk,
} from '../interfaces/ai-provider';
import { buildSystemPrompt, buildUserPrompt } from '../prompts';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly channelId = 'google';
  readonly displayName = 'Google Gemini';

  private client: GoogleGenerativeAI;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey ?? '');
    this.model = config.model;
  }

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const start = Date.now();

    const model = this.client.getGenerativeModel({ model: this.model });

    const prompt = `${buildSystemPrompt(input.language)}

${buildUserPrompt(input)}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    const latencyMs = Date.now() - start;

    try {
      // 尝试解析 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Omit<AnalysisOutput, 'tokensUsed' | 'latencyMs'>;
        return {
          ...parsed,
          tokensUsed: 0, // Gemini 不提供 token 使用量
          latencyMs,
        };
      }
    } catch {
      // 如果解析失败，返回原始文本
    }

    return {
      summary: text,
      riskLevel: 'LOW',
      categories: [],
      keyChanges: [],
      suggestions: [],
      tokensUsed: 0,
      latencyMs,
    };
  }

  async *analyzeStream(input: AnalysisInput): AsyncIterable<StreamChunk> {
    const model = this.client.getGenerativeModel({ model: this.model });

    const prompt = `${buildSystemPrompt(input.language)}

${buildUserPrompt(input)}`;

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield { type: 'text', content: text };
      }
    }

    yield { type: 'done', content: '' };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 使用 /v1beta/models 端点验证连接
      const model = this.client.getGenerativeModel({ model: this.model });
      // 发送一个简单的请求来验证
      await model.generateContent('ping');
      return true;
    } catch {
      return false;
    }
  }
}