import type {
  AIProvider,
  AIProviderConfig,
  AnalysisInput,
  AnalysisOutput,
  StreamChunk,
} from '../interfaces/ai-provider';
import { buildSystemPrompt, buildUserPrompt } from '../prompts';

/**
 * Ollama 本地模型提供商
 * 通过 HTTP API 调用本地运行的 Ollama 服务
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly channelId = 'ollama';
  readonly displayName = 'Ollama';

  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(config: AIProviderConfig) {
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.model = config.model;
    this.timeout = config.timeout ?? 30000;
  }

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const start = Date.now();

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(input.language) },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        stream: false,
        options: {
          temperature: input.temperature ?? 0.3,
          num_predict: input.maxTokens ?? 4096,
        },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      message: { content: string };
      eval_count?: number;
      prompt_eval_count?: number;
    };

    const latencyMs = Date.now() - start;
    const jsonMatch = data.message.content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}') as Omit<AnalysisOutput, 'tokensUsed' | 'latencyMs'>;

    return {
      ...parsed,
      tokensUsed: (data.eval_count ?? 0) + (data.prompt_eval_count ?? 0),
      latencyMs,
    };
  }

  async *analyzeStream(input: AnalysisInput): AsyncIterable<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(input.language) },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        stream: true,
        options: {
          temperature: input.temperature ?? 0.3,
          num_predict: input.maxTokens ?? 4096,
        },
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok || !response.body) {
      yield { type: 'error', content: `Ollama stream error: ${response.status}` };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as { message?: { content: string }; done: boolean };
          if (parsed.message?.content) {
            yield { type: 'text', content: parsed.message.content };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', content: '' };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
