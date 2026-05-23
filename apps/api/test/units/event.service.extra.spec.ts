import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventType, FilterAction } from '@repo-pulse/database';
import { EventService } from '@modules/event/event.service';
import { EventGateway } from '@modules/event/event.gateway';
import { AIService } from '@modules/ai/ai.service';
import { FilterService } from '@modules/filter/filter.service';
import { NotificationService } from '@modules/notification/notification.service';
import { ImService } from '@modules/im/im.service';

async function makeService(prismaMock: any) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      EventService,
      { provide: EventGateway, useValue: { broadcastNewEvent: jest.fn() } },
      { provide: AIService, useValue: { triggerAnalysis: jest.fn().mockResolvedValue(undefined) } },
      { provide: FilterService, useValue: { applyRules: jest.fn().mockResolvedValue({ action: FilterAction.INCLUDE }), hasRuleReferencingField: jest.fn().mockResolvedValue(false) } },
      { provide: NotificationService, useValue: { getPreferences: jest.fn().mockResolvedValue({ channels: [], events: {} }), send: jest.fn() } },
      { provide: ImService, useValue: { sendRepositoryEventNotification: jest.fn().mockResolvedValue({ sent: 0 }) } },
    ],
  }).compile();
  const service = moduleRef.get(EventService);
  (service as any).prisma = prismaMock;
  return service;
}

describe('EventService - query methods', () => {
  const REPO_ID = 'r1';
  const USER_ID = 'u1';

  function makeBasePrisma(overrides: Record<string, any> = {}) {
    return {
      event: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      aIAnalysis: { findFirst: jest.fn().mockResolvedValue(null) },
      repository: { findUnique: jest.fn().mockResolvedValue(null) },
      userRepository: { findMany: jest.fn().mockResolvedValue([{ userId: USER_ID, repositoryId: REPO_ID }]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }

  // ── findAll ───────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('returns empty result when user has no accessible repositories', async () => {
      const prisma = makeBasePrisma();
      prisma.userRepository.findMany = jest.fn().mockResolvedValue([]);
      const service = await makeService(prisma);

      const result = await service.findAll(USER_ID, {});
      expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    });

    it('returns paginated events', async () => {
      const prisma = makeBasePrisma();
      const events = [{ id: 'e1', type: 'PUSH' }];
      prisma.event.findMany = jest.fn().mockResolvedValue(events);
      prisma.event.count = jest.fn().mockResolvedValue(1);
      const service = await makeService(prisma);

      const result = await service.findAll(USER_ID, { page: 1, pageSize: 20 });
      expect(result.items).toBe(events);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('filters by specific repositoryId', async () => {
      const prisma = makeBasePrisma();
      prisma.event.findMany = jest.fn().mockResolvedValue([]);
      prisma.event.count = jest.fn().mockResolvedValue(0);
      const service = await makeService(prisma);

      await service.findAll(USER_ID, { repositoryId: REPO_ID });
      expect(prisma.event.findMany).toHaveBeenCalled();
    });

    it('uses default sortBy=occurredAt for invalid sortBy', async () => {
      const prisma = makeBasePrisma();
      prisma.event.findMany = jest.fn().mockResolvedValue([]);
      prisma.event.count = jest.fn().mockResolvedValue(0);
      const service = await makeService(prisma);

      await service.findAll(USER_ID, { sortBy: 'malicious_field' as any });
      const call = prisma.event.findMany.mock.calls[0][0];
      expect(call.orderBy.occurredAt).toBeDefined();
    });

    it('filters by repositoryIds param (comma separated)', async () => {
      const prisma = makeBasePrisma();
      prisma.userRepository.findMany = jest.fn().mockResolvedValue([
        { repositoryId: 'r1' }, { repositoryId: 'r2' }, { repositoryId: 'r3' },
      ]);
      prisma.event.findMany = jest.fn().mockResolvedValue([]);
      prisma.event.count = jest.fn().mockResolvedValue(0);
      const service = await makeService(prisma);

      await service.findAll(USER_ID, { repositoryIds: 'r1,r2' });
      // Both r1 and r2 should be in the query
      expect(prisma.event.findMany).toHaveBeenCalled();
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('returns event when found', async () => {
      const prisma = makeBasePrisma();
      const event = { id: 'e1', type: 'PUSH', analyses: [], approvals: [] };
      prisma.event.findUnique = jest.fn().mockResolvedValue(event);
      const service = await makeService(prisma);

      const result = await service.findById('e1');
      expect(result).toBe(event);
    });

    it('throws NotFoundException when event not found', async () => {
      const prisma = makeBasePrisma();
      prisma.event.findUnique = jest.fn().mockResolvedValue(null);
      const service = await makeService(prisma);

      await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByExternalId ───────────────────────────────────────────────────────
  describe('findByExternalId', () => {
    it('returns event when found', async () => {
      const prisma = makeBasePrisma();
      const event = { id: 'e1', externalId: 'sha1' };
      prisma.event.findFirst = jest.fn().mockResolvedValue(event);
      const service = await makeService(prisma);

      const result = await service.findByExternalId(REPO_ID, 'sha1');
      expect(result).toBe(event);
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { repositoryId: REPO_ID, externalId: 'sha1' },
      });
    });

    it('returns null when not found', async () => {
      const prisma = makeBasePrisma();
      prisma.event.findFirst = jest.fn().mockResolvedValue(null);
      const service = await makeService(prisma);

      const result = await service.findByExternalId(REPO_ID, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── getEventStats ──────────────────────────────────────────────────────────
  describe('getEventStats', () => {
    it('returns zero totals when no accessible repos', async () => {
      const prisma = makeBasePrisma();
      prisma.userRepository.findMany = jest.fn().mockResolvedValue([]);
      const service = await makeService(prisma);

      const result = await service.getEventStats(USER_ID);
      expect(result).toEqual({ total: 0, byType: [] });
    });

    it('returns event counts by type', async () => {
      const prisma = makeBasePrisma();
      prisma.event.count = jest.fn().mockResolvedValue(5);
      prisma.event.groupBy = jest.fn().mockResolvedValue([
        { type: 'PUSH', _count: 3 },
        { type: 'PR_OPENED', _count: 2 },
      ]);
      const service = await makeService(prisma);

      const result = await service.getEventStats(USER_ID);
      expect(result.total).toBe(5);
      expect(result.byType).toEqual([
        { type: 'PUSH', count: 3 },
        { type: 'PR_OPENED', count: 2 },
      ]);
    });

    it('applies dateFrom and dateTo filters', async () => {
      const prisma = makeBasePrisma();
      prisma.event.count = jest.fn().mockResolvedValue(0);
      prisma.event.groupBy = jest.fn().mockResolvedValue([]);
      const service = await makeService(prisma);

      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');
      await service.getEventStats(USER_ID, undefined, undefined, undefined, from, to);
      const countCall = prisma.event.count.mock.calls[0][0];
      expect(countCall.where.occurredAt?.gte).toBe(from);
      expect(countCall.where.occurredAt?.lte).toBe(to);
    });

    it('applies only dateFrom when dateTo not provided', async () => {
      const prisma = makeBasePrisma();
      prisma.event.count = jest.fn().mockResolvedValue(0);
      prisma.event.groupBy = jest.fn().mockResolvedValue([]);
      const service = await makeService(prisma);

      const from = new Date('2024-01-01');
      await service.getEventStats(USER_ID, undefined, undefined, undefined, from, undefined);
      const countCall = prisma.event.count.mock.calls[0][0];
      expect(countCall.where.occurredAt?.gte).toBe(from);
      expect(countCall.where.occurredAt?.lte).toBeUndefined();
    });
  });

  // ── deleteOldEvents ────────────────────────────────────────────────────────
  describe('deleteOldEvents', () => {
    it('deletes events older than specified days', async () => {
      const prisma = makeBasePrisma();
      prisma.event.deleteMany = jest.fn().mockResolvedValue({ count: 5 });
      const service = await makeService(prisma);

      const result = await service.deleteOldEvents(REPO_ID, 30);
      expect(result.count).toBe(5);
      expect(prisma.event.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ repositoryId: REPO_ID }) }),
      );
    });
  });

  // ── retryNotificationsAfterAnalysis ──────────────────────────────────────
  describe('retryNotificationsAfterAnalysis', () => {
    it('returns early when event not found', async () => {
      const prisma = makeBasePrisma();
      prisma.event.findUnique = jest.fn().mockResolvedValue(null);
      const service = await makeService(prisma);

      await expect(service.retryNotificationsAfterAnalysis('bad-id')).resolves.toBeUndefined();
    });
  });

  // ── resolveChannelsForEvent — PR filtering ────────────────────────────────
  describe('PR event channel filtering via create', () => {
    const flushAsync = async () => {
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setTimeout(resolve, 30));
    };

    it('skips PR event notification when prUpdates=false', async () => {
      const prisma = makeBasePrisma();
      const createdEvent = {
        id: 'e1', repositoryId: REPO_ID, type: EventType.PR_OPENED,
        action: 'opened', title: 'PR', body: null, author: 'alice',
        authorAvatar: null, externalId: 'pr-1', externalUrl: null,
        branch: null, sourceBranch: null, targetBranch: null,
        createdAt: new Date(),
      };
      prisma.event.create = jest.fn().mockResolvedValue(createdEvent);
      prisma.event.findUnique = jest.fn().mockResolvedValue({ type: EventType.PR_OPENED, repositoryId: REPO_ID });
      prisma.user.findMany = jest.fn().mockResolvedValue([
        { id: USER_ID, preferences: { monitoringScope: { repositoryIds: [REPO_ID] } } },
      ]);
      prisma.aIAnalysis.findFirst = jest.fn().mockResolvedValue(null);
      prisma.repository.findUnique = jest.fn().mockResolvedValue({ fullName: 'org/repo' });

      const moduleRef = await Test.createTestingModule({
        providers: [
          EventService,
          { provide: EventGateway, useValue: { broadcastNewEvent: jest.fn() } },
          { provide: AIService, useValue: { triggerAnalysis: jest.fn().mockResolvedValue(undefined) } },
          { provide: FilterService, useValue: { applyRules: jest.fn().mockResolvedValue({ action: FilterAction.INCLUDE }), hasRuleReferencingField: jest.fn().mockResolvedValue(false) } },
          {
            provide: NotificationService,
            useValue: {
              getPreferences: jest.fn().mockResolvedValue({
                channels: ['IN_APP'],
                events: { prUpdates: false },
              }),
              send: jest.fn(),
            },
          },
          { provide: ImService, useValue: { sendRepositoryEventNotification: jest.fn().mockResolvedValue({ sent: 0 }) } },
        ],
      }).compile();
      const service = moduleRef.get(EventService);
      (service as any).prisma = prisma;

      await service.create({ repositoryId: REPO_ID, type: EventType.PR_OPENED, action: 'opened', title: 'PR', author: 'alice', externalId: 'pr-1' });
      await flushAsync();

      const ns = moduleRef.get(NotificationService);
      expect(ns.send).not.toHaveBeenCalled();
    });
  });
});
