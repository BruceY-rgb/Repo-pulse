const mockEventFindUnique = jest.fn();
const mockAnalysisFindFirst = jest.fn();
const mockAnalysisCreate = jest.fn();
const mockUserFindUnique = jest.fn();
const mockProviderAnalyze = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  prisma: {
    event: { findUnique: (...a: any[]) => mockEventFindUnique(...a) },
    aIAnalysis: {
      findFirst: (...a: any[]) => mockAnalysisFindFirst(...a),
      create: (...a: any[]) => mockAnalysisCreate(...a),
    },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
  },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
  AnalysisStatus: { COMPLETED: 'COMPLETED', SKIPPED: 'SKIPPED', FAILED: 'FAILED' },
}));

jest.mock('@repo-pulse/ai-sdk', () => ({
  createProvider: jest.fn().mockReturnValue({ analyze: (...a: any[]) => mockProviderAnalyze(...a) }),
}));

jest.mock('@repo-pulse/shared', () => ({}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
}));

jest.mock('../../src/modules/ai/ai-event-normalizer', () => ({
  AIEventNormalizer: jest.fn(),
}));

import { createProvider } from '@repo-pulse/ai-sdk';
import { AIService } from '../../src/modules/ai/ai.service';

const mockCreateProvider = createProvider as jest.Mock;

function makeEvent(overrides: object = {}) {
  return {
    id: 'e1',
    type: 'PUSH',
    title: 'Push to main',
    body: 'some content',
    author: 'alice',
    repository: {
      users: [{ userId: 'u1', user: { id: 'u1' } }],
    },
    ...overrides,
  };
}

function makeUser(overrides: object = {}) {
  return {
    id: 'u1',
    aiProvider: null,
    aiApiKey: 'sk-test-key',
    aiModel: null,
    aiBaseUrl: null,
    ...overrides,
  };
}

function makeAnalysis(overrides: object = {}) {
  return {
    id: 'analysis-1',
    summary: 'All good',
    summaryShort: 'Brief',
    summaryLong: 'Detailed',
    category: 'FEATURE',
    riskLevel: 'LOW',
    riskScore: 0.1,
    riskReasons: [],
    riskReason: null,
    tags: ['tag1'],
    categories: ['FEATURE'],
    affectedAreas: [],
    impactSummary: '',
    suggestedAction: 'APPROVE',
    confidence: 0.9,
    keyChanges: [],
    suggestions: [],
    tokensUsed: 100,
    latencyMs: 500,
    ...overrides,
  };
}

describe('AIService', () => {
  let service: AIService;
  let mockQueue: { add: jest.Mock };
  let mockNormalizer: { shouldAnalyze: jest.Mock; buildAnalysisInput: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockNormalizer = {
      shouldAnalyze: jest.fn().mockReturnValue({ should: true }),
      buildAnalysisInput: jest.fn().mockReturnValue({ eventType: 'PUSH', title: 'Push', body: 'content', language: 'zh', context: {} }),
    };
    service = new AIService(mockQueue as any, mockNormalizer as any);
  });

  // ── triggerAnalysis ───────────────────────────────────────────────────────
  describe('triggerAnalysis', () => {
    it('adds job to ai-analysis queue', async () => {
      await service.triggerAnalysis('e1');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'analyze-event',
        { eventId: 'e1', force: false },
        expect.objectContaining({ attempts: expect.any(Number) }),
      );
    });

    it('passes force=true when specified', async () => {
      await service.triggerAnalysis('e1', true);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'analyze-event',
        { eventId: 'e1', force: true },
        expect.any(Object),
      );
    });
  });

  // ── analyzeEvent — event not found ────────────────────────────────────────
  describe('analyzeEvent', () => {
    it('throws when event not found', async () => {
      mockEventFindUnique.mockResolvedValue(null);
      await expect(service.analyzeEvent('missing')).rejects.toThrow('Event not found: missing');
    });

    it('returns cached result when COMPLETED analysis exists and force=false', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      const existingAnalysis = makeAnalysis();
      mockAnalysisFindFirst.mockResolvedValue(existingAnalysis);

      const result = await service.analyzeEvent('e1', false);
      expect(result.summary).toBe('All good');
      expect(mockProviderAnalyze).not.toHaveBeenCalled();
    });

    it('bypasses cache when force=true', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockUserFindUnique.mockResolvedValue(makeUser());
      mockProviderAnalyze.mockResolvedValue({
        summary: 'Fresh', riskLevel: 'LOW', categories: [], keyChanges: [], suggestions: [], tokensUsed: 0, latencyMs: 0,
      });
      mockAnalysisCreate.mockResolvedValue({});

      await service.analyzeEvent('e1', true);
      expect(mockAnalysisFindFirst).not.toHaveBeenCalled();
      expect(mockProviderAnalyze).toHaveBeenCalled();
    });

    it('returns failedOutput and saves SKIPPED when shouldAnalyze=false', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockNormalizer.shouldAnalyze.mockReturnValue({ should: false, reason: 'empty_content' });
      mockAnalysisCreate.mockResolvedValue({});

      const result = await service.analyzeEvent('e1');
      expect(result.summary).toBe('empty_content');
      expect(mockAnalysisCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }),
      );
    });

    it('returns failedOutput when no users associated', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent({ repository: { users: [] } }));
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockAnalysisCreate.mockResolvedValue({});

      const result = await service.analyzeEvent('e1');
      expect(result.summary).toBe('No user associated with repository');
    });

    it('returns failedOutput when user not found', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockUserFindUnique.mockResolvedValue(null);
      mockAnalysisCreate.mockResolvedValue({});

      const result = await service.analyzeEvent('e1');
      expect(result.summary).toBe('User not found');
    });

    it('returns failedOutput when no API key available', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockUserFindUnique.mockResolvedValue(makeUser({ aiApiKey: '' }));
      mockAnalysisCreate.mockResolvedValue({});
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const result = await service.analyzeEvent('e1');
      expect(result.summary).toBe('Missing AI provider API key');
      expect(mockAnalysisCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );

      process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('saves FAILED and returns failedOutput when provider.analyze throws', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockUserFindUnique.mockResolvedValue(makeUser());
      mockProviderAnalyze.mockRejectedValue(new Error('API timeout'));
      mockAnalysisCreate.mockResolvedValue({});

      const result = await service.analyzeEvent('e1');
      expect(result.summary).toBe('API timeout');
      expect(mockAnalysisCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
      );
    });

    it('saves successful analysis to DB and returns result', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockUserFindUnique.mockResolvedValue(makeUser());
      const analysisResult = {
        summary: 'Good commit',
        summaryShort: 'Good',
        summaryLong: 'Detailed explanation',
        category: 'FEATURE',
        riskLevel: 'LOW',
        riskScore: 0.2,
        riskReasons: ['minor change'],
        tags: ['frontend'],
        affectedAreas: ['UI'],
        impactSummary: 'Minimal impact',
        suggestedAction: 'APPROVE',
        confidence: 0.95,
        keyChanges: [],
        suggestions: [],
        tokensUsed: 200,
        latencyMs: 800,
      };
      mockProviderAnalyze.mockResolvedValue(analysisResult);
      mockAnalysisCreate.mockResolvedValue({});

      const result = await service.analyzeEvent('e1');
      expect(result.summary).toBe('Good commit');
      expect(mockAnalysisCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED', riskLevel: 'LOW' }) }),
      );
    });

    it('uses env defaults when user has no AI settings', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockUserFindUnique.mockResolvedValue(makeUser({ aiProvider: null, aiApiKey: null, aiModel: null }));
      process.env.ANTHROPIC_API_KEY = 'env-key';
      mockProviderAnalyze.mockResolvedValue({
        summary: 'ok', riskLevel: 'LOW', categories: [], keyChanges: [], suggestions: [], tokensUsed: 0, latencyMs: 0,
      });
      mockAnalysisCreate.mockResolvedValue({});

      await service.analyzeEvent('e1');
      expect(mockCreateProvider).toHaveBeenCalledWith(
        expect.any(String),
        'env-key',
        expect.any(Object),
      );

      delete process.env.ANTHROPIC_API_KEY;
    });

    it('handles non-Error thrown by provider', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      mockAnalysisFindFirst.mockResolvedValue(null);
      mockUserFindUnique.mockResolvedValue(makeUser());
      mockProviderAnalyze.mockRejectedValue('string error');
      mockAnalysisCreate.mockResolvedValue({});

      const result = await service.analyzeEvent('e1');
      expect(result.summary).toBe('unknown_error');
    });

    it('toAnalysisOutput includes all fields from db record', async () => {
      mockEventFindUnique.mockResolvedValue(makeEvent());
      const record = makeAnalysis({ summaryShort: null, summaryLong: null, category: null });
      mockAnalysisFindFirst.mockResolvedValue(record);

      const result = await service.analyzeEvent('e1', false);
      expect(result.summaryShort).toBe(record.summary);
      expect(result.category).toBe('UNKNOWN');
    });
  });
});
