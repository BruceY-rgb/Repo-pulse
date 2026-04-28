/**
 * MockProvider
 *
 * 返回预定义/可配置的 AnalysisOutput，用于 CI 和单元测试。
 * 不产生任何网络请求。
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
      // 新字段
      summaryShort: 'Mock short summary.',
      summaryLong: 'This is a mock analysis long summary for testing purposes.',
      category: 'FEATURE',
      riskLevel: 'LOW',
      riskScore: 25,
      riskReasons: ['This is a mock risk reason.'],
      tags: ['frontend'],
      affectedAreas: ['UI'],
      impactSummary: 'Mock impact summary.',
      suggestedAction: 'SAFE_TO_IGNORE',
      confidence: 0.95,
      // 旧字段兼容
      summary: 'Mock short summary.',
      riskReason: 'This is a mock risk reason.',
      categories: ['FEATURE', 'frontend'],
      keyChanges: ['UI'],
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
