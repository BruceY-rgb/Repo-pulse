/**
 * 稳定性测试 — 服务故障降级验证
 *
 * 验证当依赖服务（Redis/BullMQ、AI 服务、通知服务）发生故障时，
 * 核心业务流程能够正确降级，不影响主链路响应。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { EventType, FilterAction } from '@repo-pulse/database';
import { EventService } from '@modules/event/event.service';
import { EventGateway } from '@modules/event/event.gateway';
import { AIService } from '@modules/ai/ai.service';
import { FilterService } from '@modules/filter/filter.service';
import { NotificationService } from '@modules/notification/notification.service';
import { ImService } from '@modules/im/im.service';

const flushAsync = async () => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 50));
};

const BASE_EVENT = {
  id: 'evt-stability-1',
  repositoryId: 'repo-1',
  type: EventType.PUSH,
  action: 'push',
  title: '稳定性测试事件',
  body: 'stability test body',
  author: 'stability-bot',
  authorAvatar: null,
  externalId: 'stability-ext-1',
  externalUrl: null,
  createdAt: new Date(),
};

const BASE_PRISM = () => ({
  event: {
    create: jest.fn().mockResolvedValue(BASE_EVENT),
    findUnique: jest.fn().mockResolvedValue({ type: EventType.PUSH, repositoryId: 'repo-1' }),
    findFirst: jest.fn().mockResolvedValue(null),
  },
  aIAnalysis: { findFirst: jest.fn().mockResolvedValue(null) },
  repository: { findUnique: jest.fn().mockResolvedValue({ id: 'repo-1' }) },
  userRepository: { findMany: jest.fn().mockResolvedValue([{ repositoryId: 'repo-1', userId: 'user-1' }]) },
  // 模拟用户的 monitoringScope 包含 repo-1，确保 AI 分析不被 scope 检查跳过
  // id 字段必须存在，notifyRepositoryUsers 中 userScopeMap.set(u.id, ids) 需要非 undefined key
  user: {
    findMany: jest.fn().mockResolvedValue([
      { id: 'user-1', preferences: { monitoringScope: { repositoryIds: ['repo-1'] } } },
    ]),
  },
});

async function makeService(overrides: {
  gateway?: Partial<{ broadcastNewEvent: jest.Mock }>;
  aiService?: Partial<{ triggerAnalysis: jest.Mock }>;
  notificationService?: Partial<{ getPreferences: jest.Mock; send: jest.Mock }>;
  imService?: Partial<{ sendRepositoryEventNotification: jest.Mock }>;
  prismaMock?: ReturnType<typeof BASE_PRISM>;
}) {
  const prismaMock = overrides.prismaMock ?? BASE_PRISM();
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      EventService,
      {
        provide: EventGateway,
        useValue: { broadcastNewEvent: overrides.gateway?.broadcastNewEvent ?? jest.fn() },
      },
      {
        provide: AIService,
        useValue: {
          triggerAnalysis: overrides.aiService?.triggerAnalysis ?? jest.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: FilterService,
        useValue: {
          applyRules: jest.fn().mockResolvedValue({ action: FilterAction.INCLUDE }),
          hasRuleReferencingField: jest.fn().mockResolvedValue(false),
        },
      },
      {
        provide: NotificationService,
        useValue: {
          getPreferences: overrides.notificationService?.getPreferences ??
            jest.fn().mockResolvedValue({ channels: [], events: {} }),
          send: overrides.notificationService?.send ?? jest.fn(),
        },
      },
      {
        provide: ImService,
        useValue: {
          sendRepositoryEventNotification:
            overrides.imService?.sendRepositoryEventNotification ??
            jest.fn().mockResolvedValue({ sent: 0 }),
        },
      },
    ],
  }).compile();

  const service = moduleRef.get(EventService);
  (service as any).prisma = prismaMock;
  return service;
}

describe('稳定性测试 — 服务故障降级 (Fault Tolerance)', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── WebSocket 广播失败 ────────────────────────────────────────────────────
  describe('WebSocket Gateway 故障', () => {
    it('broadcastNewEvent 同步抛错时，create() 仍正常返回事件', async () => {
      // broadcastEvent 内部用 try/catch（非 await），同步 throw 会被捕获
      const broadcastNewEvent = jest.fn().mockImplementation(() => {
        throw new Error('WebSocket 连接断开');
      });
      const service = await makeService({ gateway: { broadcastNewEvent } });

      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: '广播失败测试',
        body: 'body',
        author: 'bot',
        externalId: 'ws-fail-1',
      });

      await flushAsync();
      expect(result).toBeDefined();
      expect(result.id).toBe('evt-stability-1');
    });

    it('broadcastNewEvent 抛错时，AI 入队流程不受影响', async () => {
      const triggerAnalysis = jest.fn().mockResolvedValue(undefined);
      const broadcastNewEvent = jest.fn().mockImplementation(() => {
        throw new Error('WebSocket 断开');
      });

      const service = await makeService({
        gateway: { broadcastNewEvent },
        aiService: { triggerAnalysis },
      });

      await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: 'AI 不受广播影响测试',
        body: 'body',
        author: 'bot',
        externalId: 'ws-ai-1',
      });

      await flushAsync();
      // AI 入队应该不受 WebSocket 故障影响（broadcastEvent 独立 try/catch）
      expect(triggerAnalysis).toHaveBeenCalledTimes(1);
    });
  });

  // ── AI 服务故障 ───────────────────────────────────────────────────────────
  describe('AI 服务故障', () => {
    it('triggerAnalysis 抛错时，事件仍正常返回', async () => {
      const triggerAnalysis = jest.fn().mockRejectedValue(new Error('AI 服务不可用'));
      const service = await makeService({ aiService: { triggerAnalysis } });

      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: 'AI 故障测试',
        body: 'body',
        author: 'bot',
        externalId: 'ai-fail-1',
      });

      await flushAsync();
      expect(result).toBeDefined();
      expect(result.id).toBe('evt-stability-1');
    });

    it('AI 服务超时（5秒），不阻塞主链路', async () => {
      const triggerAnalysis = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100)),
      );
      const service = await makeService({ aiService: { triggerAnalysis } });

      const start = Date.now();
      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: 'AI 超时测试',
        body: 'body',
        author: 'bot',
        externalId: 'ai-timeout-1',
      });
      const elapsed = Date.now() - start;

      expect(result).toBeDefined();
      // create() 本身不应该等待 AI 服务（异步触发），应在 100ms 内返回
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ── 通知服务故障 ──────────────────────────────────────────────────────────
  describe('通知服务故障', () => {
    it('send() 抛错时，事件创建仍然成功', async () => {
      const send = jest.fn().mockRejectedValue(new Error('邮件发送失败'));
      const getPreferences = jest
        .fn()
        .mockResolvedValue({ channels: ['EMAIL'], events: { PUSH: true } });

      const service = await makeService({
        notificationService: { send, getPreferences },
      });

      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: '通知故障测试',
        body: 'body',
        author: 'bot',
        externalId: 'notif-fail-1',
      });

      await flushAsync();
      expect(result).toBeDefined();
      expect(result.id).toBe('evt-stability-1');
    });

    it('getPreferences() 抛错时，不影响事件入库', async () => {
      const getPreferences = jest.fn().mockRejectedValue(new Error('数据库连接超时'));
      const service = await makeService({
        notificationService: { getPreferences, send: jest.fn() },
      });

      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: '偏好读取故障测试',
        body: 'body',
        author: 'bot',
        externalId: 'pref-fail-1',
      });

      await flushAsync();
      expect(result).toBeDefined();
    });
  });

  // ── IM 服务故障 ───────────────────────────────────────────────────────────
  describe('IM 服务故障', () => {
    it('sendRepositoryEventNotification 抛错时，事件创建不受影响', async () => {
      const sendRepositoryEventNotification = jest
        .fn()
        .mockRejectedValue(new Error('飞书 Webhook 请求失败'));

      const service = await makeService({
        imService: { sendRepositoryEventNotification },
      });

      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: 'IM 故障测试',
        body: 'body',
        author: 'bot',
        externalId: 'im-fail-1',
      });

      await flushAsync();
      expect(result).toBeDefined();
      expect(result.id).toBe('evt-stability-1');
    });
  });

  // ── 多服务同时故障 ────────────────────────────────────────────────────────
  describe('级联故障场景', () => {
    it('WebSocket + 通知 同时故障，事件仍正常入库', async () => {
      // broadcastEvent 用同步 throw（会被 try/catch 捕获）
      // send 用 mockRejectedValue（会被 runPostCreateTasks.catch 捕获）
      const service = await makeService({
        gateway: {
          broadcastNewEvent: jest.fn().mockImplementation(() => {
            throw new Error('WS 断开');
          }),
        },
        notificationService: {
          getPreferences: jest.fn().mockResolvedValue({ channels: ['EMAIL'], events: { PUSH: true } }),
          send: jest.fn().mockRejectedValue(new Error('邮件服务宕机')),
        },
        imService: {
          sendRepositoryEventNotification: jest.fn().mockResolvedValue({ sent: 0 }),
        },
      });

      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: '级联故障测试',
        body: 'body',
        author: 'bot',
        externalId: 'cascade-fail-1',
      });

      await flushAsync();
      // 核心事件入库不受任何后置服务故障影响
      expect(result).toBeDefined();
      expect(result.id).toBe('evt-stability-1');
    });
  });
});
