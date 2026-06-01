import { Test, TestingModule } from '@nestjs/testing';
import { EventType, FilterAction, NotificationChannel } from '@repo-pulse/database';
import { EventService } from '@modules/event/event.service';
import { EventGateway } from '@modules/event/event.gateway';
import { AIService } from '@modules/ai/ai.service';
import { FilterService } from '@modules/filter/filter.service';
import { NotificationService } from '@modules/notification/notification.service';
import { ImService } from '@modules/im/im.service';

const flushAsync = async () => {
  // 让 EventService.create 内的 .catch 后置链有机会跑完
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 30));
};

describe('EventService - 后置编排韧性 (unit)', () => {
  const originalAIAnalysisEnabled = process.env.AI_ANALYSIS_ENABLED;
  const originalAIAutoAnalysisEnabled = process.env.AI_AUTO_ANALYSIS_ENABLED;
  const originalAIAutoAnalysisAccessModes = process.env.AI_AUTO_ANALYSIS_ACCESS_MODES;

  let service: EventService;
  let prismaMock: {
    event: { create: jest.Mock; findUnique: jest.Mock };
    aIAnalysis: { findFirst: jest.Mock };
    repository: { findUnique: jest.Mock };
    userRepository: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
  };
  let gateway: { broadcastEventCreated: jest.Mock };
  let aiService: { triggerAnalysis: jest.Mock };
  let filterService: { applyRules: jest.Mock; hasRuleReferencingField: jest.Mock };
  let notificationService: {
    getPreferences: jest.Mock;
    send: jest.Mock;
  };
  let imService: { sendRepositoryEventNotification: jest.Mock };

  const REPO_ID = 'repo-1';
  const USER_ID = 'user-1';
  const CREATED_EVENT = {
    id: 'evt-1',
    repositoryId: REPO_ID,
    type: EventType.PUSH,
    action: 'push',
    title: 'orch test',
    body: 'orch body',
    author: 'orch-bot',
    authorAvatar: null,
    externalId: 'orch-evt-1',
    externalUrl: null,
    seq: BigInt(1),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    process.env.AI_ANALYSIS_ENABLED = 'true';
    delete process.env.AI_AUTO_ANALYSIS_ENABLED;
    delete process.env.AI_AUTO_ANALYSIS_ACCESS_MODES;

    prismaMock = {
      event: {
        create: jest.fn().mockResolvedValue(CREATED_EVENT),
        // enqueueAnalysis 内部用 findUnique 看类型是否在白名单里
        findUnique: jest.fn().mockResolvedValue({ type: EventType.PUSH, repositoryId: REPO_ID }),
      },
      aIAnalysis: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      repository: {
        findUnique: jest.fn().mockResolvedValue({ fullName: 'org/repo' }),
      },
      userRepository: {
        findMany: jest.fn().mockResolvedValue([{ userId: USER_ID }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: USER_ID,
            preferences: {
              monitoringScope: {
                repositoryIds: [REPO_ID],
                branchNames: [],
                repositoryBranchScopes: {},
              },
            },
          },
        ]),
      },
    };

    gateway = { broadcastEventCreated: jest.fn() };
    aiService = { triggerAnalysis: jest.fn().mockResolvedValue(undefined) };
    filterService = {
      hasRuleReferencingField: jest.fn().mockResolvedValue(false),
      applyRules: jest.fn().mockResolvedValue({ action: FilterAction.INCLUDE }),
    };
    notificationService = {
      getPreferences: jest.fn().mockResolvedValue({
        channels: [NotificationChannel.IN_APP],
        events: {
          highRisk: true,
          prUpdates: true,
          analysisComplete: true,
          weeklyReport: false,
        },
        webhookUrl: null,
        email: null,
      }),
      send: jest.fn().mockResolvedValue({ status: 'SENT' }),
    };
    imService = {
      sendRepositoryEventNotification: jest.fn().mockResolvedValue({ sent: 0, skippedReason: 'feishu_not_configured' }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: EventGateway, useValue: gateway },
        { provide: AIService, useValue: aiService },
        { provide: FilterService, useValue: filterService },
        { provide: NotificationService, useValue: notificationService },
        { provide: ImService, useValue: imService },
      ],
    }).compile();

    service = moduleRef.get(EventService);
    // EventService 在 constructor 里 `new PrismaClient()`，单测覆盖为 mock
    (service as unknown as { prisma: typeof prismaMock }).prisma = prismaMock;
  });

  afterEach(() => {
    if (originalAIAnalysisEnabled === undefined) delete process.env.AI_ANALYSIS_ENABLED;
    else process.env.AI_ANALYSIS_ENABLED = originalAIAnalysisEnabled;

    if (originalAIAutoAnalysisEnabled === undefined) delete process.env.AI_AUTO_ANALYSIS_ENABLED;
    else process.env.AI_AUTO_ANALYSIS_ENABLED = originalAIAutoAnalysisEnabled;

    if (originalAIAutoAnalysisAccessModes === undefined) delete process.env.AI_AUTO_ANALYSIS_ACCESS_MODES;
    else process.env.AI_AUTO_ANALYSIS_ACCESS_MODES = originalAIAutoAnalysisAccessModes;
  });

  it('默认路径：事件创建后 broadcast / notify，但不自动触发 AI', async () => {
    const result = await service.create({
      repositoryId: REPO_ID,
      type: EventType.PUSH,
      action: 'push',
      title: 'orch test',
      author: 'orch-bot',
      externalId: 'orch-evt-1',
    });

    expect(result.id).toBe('evt-1');
    expect(prismaMock.event.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branches: [],
        }),
      }),
    );

    await flushAsync();

    expect(gateway.broadcastEventCreated).toHaveBeenCalledTimes(1);
    expect(gateway.broadcastEventCreated).toHaveBeenCalledWith({
      eventId: 'evt-1',
      repositoryId: REPO_ID,
      eventType: EventType.PUSH,
      seq: 1,
      createdAt: CREATED_EVENT.createdAt.toISOString(),
    });
    expect(notificationService.send).toHaveBeenCalledTimes(1);
    expect(imService.sendRepositoryEventNotification).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        eventId: 'evt-1',
        repositoryId: REPO_ID,
        repositoryName: 'org/repo',
        eventType: EventType.PUSH,
      }),
    );
    expect(aiService.triggerAnalysis).not.toHaveBeenCalled();
  });

  it('显式开启自动分析时，事件创建后会触发 AI 入队', async () => {
    process.env.AI_AUTO_ANALYSIS_ENABLED = 'true';

    await service.create({
      repositoryId: REPO_ID,
      type: EventType.PUSH,
      action: 'push',
      title: 'auto ai opt-in',
      author: 'orch-bot',
      externalId: 'orch-evt-auto-ai',
    });

    await flushAsync();

    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1', false, { source: 'auto' });
  });

  it('自动从 branch/sourceBranch/targetBranch 推导多分支归属', async () => {
    await service.create({
      repositoryId: REPO_ID,
      type: EventType.PR_OPENED,
      action: 'opened',
      title: 'branch ownership test',
      author: 'orch-bot',
      externalId: 'orch-evt-branches',
      branch: 'main',
      sourceBranch: ' feature/login ',
      targetBranch: 'main',
    });

    expect(prismaMock.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branches: ['main', 'feature/login'],
        }),
      }),
    );
  });

  it('普通通知渠道为空时，仍会尝试飞书 IM 推送', async () => {
    notificationService.getPreferences.mockResolvedValue({
      channels: [],
      events: {
        highRisk: true,
        prUpdates: true,
        analysisComplete: true,
        weeklyReport: false,
      },
      webhookUrl: null,
      email: null,
    });

    await service.create({
      repositoryId: REPO_ID,
      type: EventType.PUSH,
      action: 'push',
      title: 'im without notification channel',
      author: 'orch-bot',
      externalId: 'orch-evt-im',
    });

    await flushAsync();

    expect(notificationService.send).not.toHaveBeenCalled();
    expect(imService.sendRepositoryEventNotification).toHaveBeenCalledTimes(1);
  });

  it('broadcast 抛错时，事件主记录仍正常返回，且 notify / AI 流程继续', async () => {
    process.env.AI_AUTO_ANALYSIS_ENABLED = 'true';
    gateway.broadcastEventCreated.mockImplementation(() => {
      throw new Error('socket gateway down');
    });

    const result = await service.create({
      repositoryId: REPO_ID,
      type: EventType.PUSH,
      action: 'push',
      title: 'orch test',
      author: 'orch-bot',
      externalId: 'orch-evt-1',
    });

    // 主流程：事件成功落库并返回
    expect(result.id).toBe('evt-1');
    expect(prismaMock.event.create).toHaveBeenCalledTimes(1);

    await flushAsync();

    // broadcast 失败被 EventService.broadcastEvent 内部 try/catch 兜住，下游应继续执行
    expect(notificationService.send).toHaveBeenCalledTimes(1);
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1', false, { source: 'auto' });
  });

  it('NotificationService.send 抛错时，事件主记录仍正常返回，AI 入队仍执行', async () => {
    process.env.AI_AUTO_ANALYSIS_ENABLED = 'true';
    notificationService.send.mockRejectedValue(new Error('notification provider exploded'));

    const result = await service.create({
      repositoryId: REPO_ID,
      type: EventType.PUSH,
      action: 'push',
      title: 'orch test',
      author: 'orch-bot',
      externalId: 'orch-evt-1',
    });

    expect(result.id).toBe('evt-1');

    await flushAsync();

    // notify 内有 try/catch，AI 入队不应被阻断
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1', false, { source: 'auto' });
  });

  it('FilterService.applyRules 抛错时，事件主记录仍正常返回，AI 入队仍执行', async () => {
    process.env.AI_AUTO_ANALYSIS_ENABLED = 'true';
    filterService.applyRules.mockRejectedValue(new Error('filter rule misconfigured'));

    const result = await service.create({
      repositoryId: REPO_ID,
      type: EventType.PUSH,
      action: 'push',
      title: 'orch test',
      author: 'orch-bot',
      externalId: 'orch-evt-1',
    });

    expect(result.id).toBe('evt-1');

    await flushAsync();

    expect(notificationService.send).not.toHaveBeenCalled();
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1', false, { source: 'auto' });
  });

  it('AIService.triggerAnalysis 抛错时，事件主记录仍正常返回，无异常抛出', async () => {
    process.env.AI_AUTO_ANALYSIS_ENABLED = 'true';
    aiService.triggerAnalysis.mockRejectedValue(new Error('ai queue connection refused'));

    let result: any;
    await expect(
      (async () => {
        result = await service.create({
          repositoryId: REPO_ID,
          type: EventType.PUSH,
          action: 'push',
          title: 'orch test',
          author: 'orch-bot',
          externalId: 'orch-evt-1',
        });
      })(),
    ).resolves.not.toThrow();

    expect(result.id).toBe('evt-1');

    // 等待异步后置链跑完，确认 EventService.create 的 .catch 兜住了 AI 失败
    await flushAsync();

    expect(notificationService.send).toHaveBeenCalledTimes(1);
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1', false, { source: 'auto' });
  });
});
