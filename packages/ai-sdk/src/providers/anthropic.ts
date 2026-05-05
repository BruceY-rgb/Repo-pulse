import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  AIProviderConfig,
  AnalysisInput,
  AnalysisOutput,
  StreamChunk,
} from '../interfaces/ai-provider';
import { buildSystemPrompt, buildUserPrompt } from '../prompts';
import {
  parseAndValidateAnalysisOutput,
  sanitizeAnalysisOutput,
} from '../utils/json-parser';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly channelId = 'anthropic';
  readonly displayName = 'Anthropic';

  private client: Anthropic;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || undefined,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
    });
    this.model = config.model;
  }

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const start = Date.now();
    const systemPrompt = buildSystemPrompt(input.language);
    const userPrompt = buildUserPrompt(input);

    const rawContent = await this.callModel(systemPrompt, userPrompt, input);
    const latencyMs = Date.now() - start;

    // 解析并校验
    let parseResult = parseAndValidateAnalysisOutput(rawContent);

    // Retry 1 次 if failed
    if (!parseResult.success) {
      const retryContent = await this.callModel(
        systemPrompt,
        `${userPrompt}\n\n你的上一次输出没有通过 schema 校验。请严格按 JSON Schema 重新输出。错误信息：${parseResult.error}`,
        { ...input, temperature: 0 },
      );
      parseResult = parseAndValidateAnalysisOutput(retryContent);
    }

    if (!parseResult.success || !parseResult.data) {
      // 仍失败：返回基础结构 + 错误信息
      return {
        summary: 'Analysis failed: unable to produce valid structured output',
        riskLevel: 'MEDIUM',
        riskReason: parseResult.error ?? 'Unknown parsing error',
        categories: [],
        keyChanges: [],
        suggestions: [],
        tokensUsed: 0,
        latencyMs,
      };
    }

    const data = sanitizeAnalysisOutput(parseResult.data);

    // 双写：新字段 + 旧字段兼容
    return {
      // 新字段
      summaryShort: data.summaryShort,
      summaryLong: data.summaryLong,
      category: data.category,
      riskLevel: data.riskLevel,
      riskScore: data.riskScore,
      riskReasons: data.riskReasons,
      tags: data.tags,
      affectedAreas: data.affectedAreas,
      impactSummary: data.impactSummary,
      suggestedAction: data.suggestedAction,
      confidence: data.confidence,
      // 旧字段兼容
      summary: data.summaryShort,
      riskReason: data.riskReasons.length > 0 ? data.riskReasons.join('; ') : undefined,
      categories: [data.category, ...data.tags],
      keyChanges: data.affectedAreas,
      suggestions: [
        {
          type: data.riskLevel === 'LOW' ? 'info' : data.riskLevel === 'MEDIUM' ? 'warning' : 'critical' as const,
          title: data.suggestedAction.replace(/_/g, ' ').toLowerCase(),
          description: data.impactSummary,
        },
      ],
      tokensUsed: 0,
      latencyMs,
    };
  }

  /**
   * 调用 Claude API，返回原始文本内容
   */
  private async callModel(
    systemPrompt: string,
    userPrompt: string,
    input: AnalysisInput,
  ): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: input.temperature ?? 0.3,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text : '{}';
  }

  async *analyzeStream(_input: AnalysisInput): AsyncIterable<StreamChunk> {
    yield { type: 'done', content: '' };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
        system: 'reply with "pong"',
      });
      return true;
    } catch {
      return false;
    }
  }
}
