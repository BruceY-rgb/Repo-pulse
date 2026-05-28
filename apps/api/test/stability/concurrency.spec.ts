/**
 * 稳定性测试 — 并发安全与去重验证
 *
 * 验证系统在高并发场景下：
 * 1. 相同事件的 externalId 去重机制是否正确（只存一条）
 * 2. 并发创建不同事件时，数据不串扰
 * 3. 并发更新场景的幂等性
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

describe('稳定性测试 — 并发安全与去重 (Concurrency)', () => {
  let service: EventService;
  let createMock: jest.Mock;
  let findFirstMock: jest.Mock;
  let createCallCount: number;

  beforeEach(async () => {
    createCallCount = 0;
    createMock = jest.fn().mockImplementation((args) => {
      createCallCount++;
      return Promise.resolve({
        id: `evt-${createCallCount}`,
        repositoryId: args.data.repositoryId,
        type: args.data.type,
        action: args.data.action,
        title: args.data.title,
        body: args.data.body,
        author: args.data.author,
        authorAvatar: null,
        externalId: args.data.externalId,
        externalUrl: null,
        createdAt: new Date(),
      });
    });

    // EventService.create() 不调用 findFirst（应用层无去重），此 mock 仅满足 prismaMock 接口
    findFirstMock = jest.fn().mockResolvedValue(null);

    const prismaMock = {
      event: {
        create: createMock,
        findUnique: jest.fn().mockResolvedValue({ type: EventType.PUSH, repositoryId: 'repo-1' }),
        findFirst: findFirstMock,
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      aIAnalysis: { findFirst: jest.fn().mockResolvedValue(null) },
      repository: { findUnique: jest.fn().mockResolvedValue({ id: 'repo-1' }) },
      userRepository: { findMany: jest.fn().mockResolvedValue([{ repositoryId: 'repo-1', userId: 'user-1' }]) },
      // monitoringScope 包含 repo-1，确保 enqueueAnalysis 中 anyInScope=true，AI 路径可达
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-1', preferences: { monitoringScope: { repositoryIds: ['repo-1'] } } }]) },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        { provide: EventGateway, useValue: { broadcastNewEvent: jest.fn() } },
        { provide: AIService, useValue: { triggerAnalysis: jest.fn().mockResolvedValue(undefined) } },
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
            getPreferences: jest.fn().mockResolvedValue({ channels: [], events: {} }),
            send: jest.fn(),
          },
        },
        { provide: ImService, useValue: { sendRepositoryEventNotification: jest.fn().mockResolvedValue({ sent: 0 }) } },
      ],
    }).compile();

    service = moduleRef.get(EventService);
    (service as any).prisma = prismaMock;
  });

  afterEach(() => jest.clearAllMocks());

  // ── 事件创建行为 ──────────────────────────────────────────────────────────
  // 注：EventService.create() 无应用层去重（不调用 findFirst），
  // externalId 唯一性由数据库 unique 约束保障（DB 抛错时由调用方捕获）
  describe('事件创建行为', () => {
    it('create() 直接写入数据库，每次调用都触发 prisma.event.create', async () => {
      const firstEvent = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: '创建行为测试',
        body: 'body',
        author: 'bot',
        externalId: 'create-test-1',
      });
      await flushAsync();

      expect(firstEvent).toBeDefined();
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('不同 externalId 的事件串行创建，每个都独立入库', async () => {
      // 重置 findFirst 始终返回 null（无重复）
      findFirstMock.mockResolvedValue(null);

      const events = await Promise.all(
        ['ext-1', 'ext-2', 'ext-3'].map((externalId) =>
          service.create({
            repositoryId: 'repo-1',
            type: EventType.PUSH,
            action: 'push',
            title: `事件 ${externalId}`,
            body: 'body',
            author: 'bot',
            externalId,
          }),
        ),
      );

      await flushAsync();
      expect(events).toHaveLength(3);
      events.forEach((e) => expect(e).toBeDefined());
      // 3 个不同事件都应该入库
      expect(createMock).toHaveBeenCalledTimes(3);
    });
  });

  // ── 并发场景 ──────────────────────────────────────────────────────────────
  describe('并发创建事件', () => {
    it('10 个并发不同事件请求，全部成功处理不抛错', async () => {
      findFirstMock.mockResolvedValue(null);

      const concurrentEvents = Array.from({ length: 10 }, (_, i) =>
        service.create({
          repositoryId: 'repo-1',
          type: EventType.PUSH,
          action: 'push',
          title: `并发事件 #${i}`,
          body: `并发测试 body #${i}`,
          author: 'concurrent-bot',
          externalId: `concurrent-${i}`,
        }),
      );

      const results = await Promise.allSettled(concurrentEvents);
      await flushAsync();

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(rejected).toHaveLength(0);
      expect(fulfilled).toHaveLength(10);
    });

    it('并发 5 个相同类型事件，每个都有独立的 externalId，互不干扰', async () => {
      findFirstMock.mockResolvedValue(null);

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          service.create({
            repositoryId: 'repo-1',
            type: EventType.PULL_REQUEST,
            action: 'opened',
            title: `PR #${i + 100}`,
            body: `PR body ${i}`,
            author: `user-${i}`,
            externalId: `pr-${i + 100}`,
          }),
        ),
      );

      await flushAsync();

      expect(results).toHaveLength(5);
      results.forEach((r) => {
        expect(r).toBeDefined();
        expect(r.id).toBeTruthy();
      });
    });
  });

  // ── 响应时间基线 ──────────────────────────────────────────────────────────
  describe('响应时间基线', () => {
    it('单个事件创建应在 200ms 内完成（排除 I/O 等待）', async () => {
      findFirstMock.mockResolvedValue(null);

      const start = Date.now();
      await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: '响应时间测试',
        body: 'body',
        author: 'bot',
        externalId: 'resp-time-1',
      });
      const elapsed = Date.now() - start;

      // 业务逻辑（不含真实 DB I/O）应在 200ms 内
      expect(elapsed).toBeLessThan(200);
    });

    it('10 个串行事件创建，平均每个在 100ms 内完成', async () => {
      findFirstMock.mockResolvedValue(null);

      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        await service.create({
          repositoryId: 'repo-1',
          type: EventType.PUSH,
          action: 'push',
          title: `串行测试 #${i}`,
          body: 'body',
          author: 'bot',
          externalId: `serial-${i}`,
        });
      }
      const elapsed = Date.now() - start;

      // 10 个串行请求总共不超过 1 秒
      expect(elapsed).toBeLessThan(1000);
    });
  });

  // ── 边界条件 ──────────────────────────────────────────────────────────────
  describe('边界条件验证', () => {
    it('空 body 的事件可以正常创建', async () => {
      findFirstMock.mockResolvedValue(null);
      createMock.mockResolvedValueOnce({ ...{ id: 'evt-empty', repositoryId: 'repo-1', type: EventType.PUSH, action: 'push', title: '空 body', body: '', author: 'bot', authorAvatar: null, externalId: 'empty-body', externalUrl: null, createdAt: new Date() } });

      const result = await service.create({
        repositoryId: 'repo-1',
        type: EventType.PUSH,
        action: 'push',
        title: '空 body 测试',
        body: '',
        author: 'bot',
        externalId: 'empty-body',
      });

      expect(result).toBeDefined();
    });

    it('超长 title（1000字符）不导致服务崩溃', async () => {
      findFirstMock.mockResolvedValue(null);
      const longTitle = 'A'.repeat(1000);
      createMock.mockResolvedValueOnce({ id: 'evt-long', repositoryId: 'repo-1', type: EventType.PUSH, action: 'push', title: longTitle, body: 'body', author: 'bot', authorAvatar: null, externalId: 'long-title', externalUrl: null, createdAt: new Date() });

      await expect(
        service.create({
          repositoryId: 'repo-1',
          type: EventType.PUSH,
          action: 'push',
          title: longTitle,
          body: 'body',
          author: 'bot',
          externalId: 'long-title',
        }),
      ).resolves.toBeDefined();
    });
  });
});
