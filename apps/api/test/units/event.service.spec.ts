import { Test, TestingModule } from '@nestjs/testing';
import { EventType, FilterAction, NotificationChannel } from '@repo-pulse/database';
import { EventService } from '@modules/event/event.service';
import { EventGateway } from '@modules/event/event.gateway';
import { AIService } from '@modules/ai/ai.service';
import { FilterService } from '@modules/filter/filter.service';
import { NotificationService } from '@modules/notification/notification.service';

const flushAsync = async () => {
  // 让 EventService.create 内的 .catch 后置链有机会跑完
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 30));
};

describe('EventService - 后置编排韧性 (unit)', () => {
  let service: EventService;
  let prismaMock: {
    event: { create: jest.Mock; findUnique: jest.Mock };
    repository: { findUnique: jest.Mock };
    userRepository: { findMany: jest.Mock };
  };
  let gateway: { broadcastNewEvent: jest.Mock };
  let aiService: { triggerAnalysis: jest.Mock };
  let filterService: { applyRules: jest.Mock };
  let notificationService: {
    getPreferences: jest.Mock;
    send: jest.Mock;
  };

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
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prismaMock = {
      event: {
        create: jest.fn().mockResolvedValue(CREATED_EVENT),
        // enqueueAnalysis 内部用 findUnique 看类型是否在白名单里
        findUnique: jest.fn().mockResolvedValue({ type: EventType.PUSH }),
      },
      repository: {
        findUnique: jest.fn().mockResolvedValue({ fullName: 'org/repo' }),
      },
      userRepository: {
        findMany: jest.fn().mockResolvedValue([{ userId: USER_ID }]),
      },
    };

    gateway = { broadcastNewEvent: jest.fn() };
    aiService = { triggerAnalysis: jest.fn().mockResolvedValue(undefined) };
    filterService = {
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

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: EventGateway, useValue: gateway },
        { provide: AIService, useValue: aiService },
        { provide: FilterService, useValue: filterService },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = moduleRef.get(EventService);
    // EventService 在 constructor 里 `new PrismaClient()`，单测覆盖为 mock
    (service as unknown as { prisma: typeof prismaMock }).prisma = prismaMock;
  });

  it('正常路径：事件创建后 broadcast / notify / AI 全部触发', async () => {
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

    await flushAsync();

    expect(gateway.broadcastNewEvent).toHaveBeenCalledTimes(1);
    expect(notificationService.send).toHaveBeenCalledTimes(1);
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1');
  });

  it('broadcast 抛错时，事件主记录仍正常返回，且 notify / AI 流程继续', async () => {
    gateway.broadcastNewEvent.mockImplementation(() => {
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
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1');
  });

  it('NotificationService.send 抛错时，事件主记录仍正常返回，AI 入队仍执行', async () => {
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
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1');
  });

  it('FilterService.applyRules 抛错时，事件主记录仍正常返回，AI 入队仍执行', async () => {
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
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1');
  });

  it('AIService.triggerAnalysis 抛错时，事件主记录仍正常返回，无异常抛出', async () => {
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
    expect(aiService.triggerAnalysis).toHaveBeenCalledWith('evt-1');
  });
});
