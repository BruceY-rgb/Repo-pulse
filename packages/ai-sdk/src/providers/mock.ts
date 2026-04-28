/**
 * MockProvider
 *
 * 返回预定义的 AnalysisOutput，用于 CI 和单元测试。
 * 不产生任何网络请求。
 *
 * Note: Step 2 会扩展 AnalysisOutput 接口添加新字段，届时此 MockProvider 会同步更新。
 */
import type {
  AIProvider,
  AIProviderConfig,
  AnalysisInput,
  AnalysisOutput,
  StreamChunk,
} from '../interfaces/ai-provider';

export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly channelId = 'mock';
  readonly displayName = 'Mock Provider';

  constructor(_config: AIProviderConfig = { model: 'mock' }) {}

  async analyze(_input: AnalysisInput): Promise<AnalysisOutput> {
    return {
      summary: 'This is a mock analysis summary for testing.',
      riskLevel: 'LOW',
      riskReason: 'This is a mock risk reason.',
      categories: ['feature'],
      keyChanges: ['Mock change 1'],
      suggestions: [
        { type: 'info', title: 'Mock suggestion', description: 'Mock description' },
      ],
      tokensUsed: 0,
      latencyMs: 0,
    };
  }

  async *analyzeStream(_input: AnalysisInput): AsyncIterable<StreamChunk> {
    yield { type: 'done', content: '' };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
