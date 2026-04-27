import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  AIProviderConfig,
  AnalysisInput,
  AnalysisOutput,
  StreamChunk,
} from '../interfaces/ai-provider';
import { buildSystemPrompt, buildUserPrompt } from '../prompts';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly channelId = 'anthropic';
  readonly displayName = 'Anthropic';

  private client: Anthropic;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
    });
    this.model = config.model;
  }

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const start = Date.now();

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: input.maxTokens ?? 2048,
      system: buildSystemPrompt(input.language),
      messages: [
        { role: 'user', content: buildUserPrompt(input) },
      ],
      temperature: input.temperature ?? 0.3,
    });

    const latencyMs = Date.now() - start;
    const textBlock = response.content.find((b) => b.type === 'text');
    const content = textBlock && 'text' in textBlock ? textBlock.text : '{}';

    // 从 Claude 的 XML/JSON 混合输出中提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as Omit<AnalysisOutput, 'tokensUsed' | 'latencyMs'>;

    return {
      ...parsed,
      tokensUsed: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      latencyMs,
    };
  }

  async *analyzeStream(input: AnalysisInput): AsyncIterable<StreamChunk> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: input.maxTokens ?? 2048,
      system: buildSystemPrompt(input.language),
      messages: [
        { role: 'user', content: buildUserPrompt(input) },
      ],
      temperature: input.temperature ?? 0.3,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && 'delta' in event) {
        const delta = event.delta;
        if ('text' in delta) {
          yield { type: 'text', content: delta.text };
        }
      }
    }

    yield { type: 'done', content: '' };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // 用最小请求检测可用性
      await this.client.messages.create({
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }
}
