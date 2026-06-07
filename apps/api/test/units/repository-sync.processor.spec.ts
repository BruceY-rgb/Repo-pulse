import { RepositorySyncProcessor } from '../../src/modules/repository/repository-sync.processor';

describe('RepositorySyncProcessor', () => {
  const createProcessor = () => {
    const repositoryService = {
      sync: jest.fn().mockResolvedValue(undefined),
    };
    const eventGateway = {
      broadcastRepositorySyncProgress: jest.fn(),
      broadcastRepositorySynced: jest.fn(),
      broadcastRepositorySyncFailed: jest.fn(),
    };

    return {
      processor: new RepositorySyncProcessor(repositoryService as any, eventGateway as any),
      repositoryService,
      eventGateway,
    };
  };

  it('runs silent fallback sync without event notifications or AI analysis', async () => {
    const { processor, repositoryService } = createProcessor();

    await processor.process({
      id: 'job-1',
      data: { repositoryId: 'r1', userId: 'u1', silent: true },
    } as any);

    expect(repositoryService.sync).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        eventPostCreate: { notify: false, analyze: false },
        onStageStart: expect.any(Function),
      }),
    );
  });

  it('keeps manual sync notification behavior unchanged', async () => {
    const { processor, repositoryService } = createProcessor();

    await processor.process({
      id: 'job-2',
      data: { repositoryId: 'r1', userId: 'u1' },
    } as any);

    expect(repositoryService.sync).toHaveBeenCalledWith(
      'r1',
      expect.not.objectContaining({
        eventPostCreate: expect.anything(),
      }),
    );
  });
});
