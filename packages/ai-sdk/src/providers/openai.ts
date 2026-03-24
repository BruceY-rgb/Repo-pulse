import OpenAI from 'openai';
import type {
  AIProvider,
  AIProviderConfig,
  AnalysisInput,
  AnalysisOutput,
  StreamChunk,
} from '../interfaces/ai-provider';
import { buildSystemPrompt, buildUserPrompt } from '../prompts';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor(config: AIProviderConfig) {
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
    const parsed = JSON.parse(content) as Omit<AnalysisOutput, 'tokensUsed' | 'latencyMs'>;

    return {
      ...parsed,
      tokensUsed: response.usage?.total_tokens ?? 0,
      latencyMs,
    };
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
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
