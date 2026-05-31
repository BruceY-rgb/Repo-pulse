const mockEventFindUnique = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  NotificationChannel: { IN_APP: 'IN_APP', EMAIL: 'EMAIL' },
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  prisma: {
    event: { findUnique: (...a: any[]) => mockEventFindUnique(...a) },
  },
}));

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => {},
  WorkerHost: class { process(_job: any): any {} },
  OnWorkerEvent: () => () => {},
  InjectQueue: () => () => {},
}));

jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  forwardRef: (fn: any) => fn,
  Inject: () => () => {},
}));

jest.mock('../../src/modules/event/event.gateway', () => ({
  EventGateway: jest.fn(),
}));

import { AIProcessor } from '../../src/modules/ai/ai-analysis.processor';

describe('AIProcessor', () => {
  const originalAIAnalysisEnabled = process.env.AI_ANALYSIS_ENABLED;
  const originalAIAutoAnalysisEnabled = process.env.AI_AUTO_ANALYSIS_ENABLED;

  let processor: AIProcessor;
  let mockAIService: { analyzeEvent: jest.Mock };
  let mockApprovalService: { createFromAIAnalysis: jest.Mock };
  let mockNotificationService: { getPreferences: jest.Mock; send: jest.Mock };
  let mockEventService: { retryNotificationsAfterAnalysis: jest.Mock };
  let mockEventGateway: { broadcastAnalysisCompleted: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AI_ANALYSIS_ENABLED;
    process.env.AI_AUTO_ANALYSIS_ENABLED = 'true';
    mockAIService = { analyzeEvent: jest.fn().mockResolvedValue({ summary: 'All good' }) };
    mockApprovalService = { createFromAIAnalysis: jest.fn().mockResolvedValue(null) };
    mockNotificationService = {
      getPreferences: jest.fn().mockResolvedValue({ events: { highRisk: true }, channels: ['IN_APP'] }),
      send: jest.fn().mockResolvedValue(undefined),
    };
    mockEventService = { retryNotificationsAfterAnalysis: jest.fn().mockResolvedValue(undefined) };
    mockEventGateway = { broadcastAnalysisCompleted: jest.fn() };

    processor = new AIProcessor(
      mockAIService as any,
      mockApprovalService as any,
      mockNotificationService as any,
      mockEventService as any,
      mockEventGateway as any,
    );
  });

  afterEach(() => {
    if (originalAIAnalysisEnabled === undefined) delete process.env.AI_ANALYSIS_ENABLED;
    else process.env.AI_ANALYSIS_ENABLED = originalAIAnalysisEnabled;

    if (originalAIAutoAnalysisEnabled === undefined) delete process.env.AI_AUTO_ANALYSIS_ENABLED;
    else process.env.AI_AUTO_ANALYSIS_ENABLED = originalAIAutoAnalysisEnabled;
  });

  // ── process ───────────────────────────────────────────────────────────────
  describe('process', () => {
    const makeJob = (data: object) => ({ data }) as any;

    it('calls analyzeEvent with eventId and force', async () => {
      await processor.process(makeJob({ eventId: 'e1', force: true }));
      expect(mockAIService.analyzeEvent).toHaveBeenCalledWith('e1', true);
    });

    it('defaults force to false when not provided', async () => {
      await processor.process(makeJob({ eventId: 'e1' }));
      expect(mockAIService.analyzeEvent).toHaveBeenCalledWith('e1', false);
    });

    it('skips existing queued auto jobs when auto analysis is disabled', async () => {
      delete process.env.AI_AUTO_ANALYSIS_ENABLED;

      await processor.process(makeJob({ eventId: 'e1', force: false }));

      expect(mockAIService.analyzeEvent).not.toHaveBeenCalled();
      expect(mockEventGateway.broadcastAnalysisCompleted).not.toHaveBeenCalled();
    });

    it('skips every queued job when AI analysis is globally disabled', async () => {
      process.env.AI_ANALYSIS_ENABLED = 'false';

      await processor.process(makeJob({ eventId: 'e1', force: true, source: 'manual' }));

      expect(mockAIService.analyzeEvent).not.toHaveBeenCalled();
      expect(mockEventGateway.broadcastAnalysisCompleted).not.toHaveBeenCalled();
    });

    it('retries notifications after analysis', async () => {
      await processor.process(makeJob({ eventId: 'e1' }));
      expect(mockEventService.retryNotificationsAfterAnalysis).toHaveBeenCalledWith('e1');
    });

    it('broadcasts analysis completed', async () => {
      await processor.process(makeJob({ eventId: 'e1' }));
      expect(mockEventGateway.broadcastAnalysisCompleted).toHaveBeenCalledWith('e1');
    });

    it('does not notify when no approval created', async () => {
      mockApprovalService.createFromAIAnalysis.mockResolvedValue(null);
      await processor.process(makeJob({ eventId: 'e1' }));
      expect(mockEventFindUnique).not.toHaveBeenCalled();
    });

    it('notifies users when approval created and user has IN_APP preference', async () => {
      mockApprovalService.createFromAIAnalysis.mockResolvedValue({ id: 'appr-1' });
      mockEventFindUnique.mockResolvedValue({
        title: 'Push event',
        repository: {
          users: [{ userId: 'u1' }],
        },
      });
      mockNotificationService.getPreferences.mockResolvedValue({
        events: { highRisk: true },
        channels: ['IN_APP'],
      });

      await processor.process(makeJob({ eventId: 'e1' }));
      expect(mockNotificationService.send).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', eventId: 'e1', channel: 'IN_APP' }),
      );
    });

    it('skips notification when user does not have highRisk events enabled', async () => {
      mockApprovalService.createFromAIAnalysis.mockResolvedValue({ id: 'appr-1' });
      mockEventFindUnique.mockResolvedValue({
        title: 'Push',
        repository: { users: [{ userId: 'u1' }] },
      });
      mockNotificationService.getPreferences.mockResolvedValue({
        events: { highRisk: false },
        channels: ['IN_APP'],
      });

      await processor.process(makeJob({ eventId: 'e1' }));
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it('skips notification when user does not have IN_APP channel', async () => {
      mockApprovalService.createFromAIAnalysis.mockResolvedValue({ id: 'appr-1' });
      mockEventFindUnique.mockResolvedValue({
        title: 'Push',
        repository: { users: [{ userId: 'u1' }] },
      });
      mockNotificationService.getPreferences.mockResolvedValue({
        events: { highRisk: true },
        channels: ['EMAIL'],
      });

      await processor.process(makeJob({ eventId: 'e1' }));
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it('returns early when event not found during notification', async () => {
      mockApprovalService.createFromAIAnalysis.mockResolvedValue({ id: 'appr-1' });
      mockEventFindUnique.mockResolvedValue(null);

      await expect(processor.process(makeJob({ eventId: 'e1' }))).resolves.toBeUndefined();
      expect(mockNotificationService.send).not.toHaveBeenCalled();
    });

    it('re-throws error from analyzeEvent', async () => {
      mockAIService.analyzeEvent.mockRejectedValue(new Error('AI failed'));
      await expect(processor.process(makeJob({ eventId: 'e1' }))).rejects.toThrow('AI failed');
    });

    it('re-throws non-Error objects wrapped as Error', async () => {
      mockAIService.analyzeEvent.mockRejectedValue('string error');
      await expect(processor.process(makeJob({ eventId: 'e1' }))).rejects.toBeDefined();
    });
  });

  // ── event callbacks ───────────────────────────────────────────────────────
  it('onCompleted does not throw', () => {
    expect(() => (processor as any).onCompleted({ id: 'j1' })).not.toThrow();
  });

  it('onFailed does not throw', () => {
    expect(() => (processor as any).onFailed({ id: 'j1' }, new Error('oops'))).not.toThrow();
  });
});
