import { ApprovalStatus, RiskLevel } from '@repo-pulse/database';
import { WorkbenchService } from '../../src/modules/workbench/workbench.service';

// ── mock prisma & utils ────────────────────────────────────────────────────
const mockUserRepoFindMany = jest.fn();
const mockUserFindUnique = jest.fn();
const mockConversationStateFindMany = jest.fn();
const mockConversationStateUpsert = jest.fn();
const mockConversationStateFindUnique = jest.fn();
const mockEventFindMany = jest.fn();
const mockEventFindFirst = jest.fn();
const mockApprovalFindMany = jest.fn();
const mockApprovalFindFirst = jest.fn();
const mockAssertUserCanAccessRepository = jest.fn();
const mockGetUserMonitoredRepositoryIds = jest.fn();

jest.mock('../../src/common/utils/repository-access', () => ({
  assertUserCanAccessRepository: (...a: any[]) => mockAssertUserCanAccessRepository(...a),
  getUserMonitoredRepositoryIds: (...a: any[]) => mockGetUserMonitoredRepositoryIds(...a),
  isEditableRepositoryAccessLevel: (level: string) =>
    ['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE'].includes(level),
}));

jest.mock('@repo-pulse/database', () => ({
  ApprovalStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
  },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  NotificationChannel: { IN_APP: 'IN_APP', EMAIL: 'EMAIL' },
  RepositoryAccessLevel: {
    OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN',
    WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE',
  },
  prisma: {
    userRepository: { findMany: (...a: any[]) => mockUserRepoFindMany(...a) },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    userRepositoryConversationState: {
      findMany: (...a: any[]) => mockConversationStateFindMany(...a),
      upsert: (...a: any[]) => mockConversationStateUpsert(...a),
      findUnique: (...a: any[]) => mockConversationStateFindUnique(...a),
    },
    event: {
      findMany: (...a: any[]) => mockEventFindMany(...a),
      findFirst: (...a: any[]) => mockEventFindFirst(...a),
    },
    approval: {
      findMany: (...a: any[]) => mockApprovalFindMany(...a),
      findFirst: (...a: any[]) => mockApprovalFindFirst(...a),
    },
  },
}));

// ── helpers ────────────────────────────────────────────────────────────────
function makeDate(offsetMs = 0): Date {
  return new Date(1_000_000_000_000 + offsetMs);
}

function makeRepo(id: string, overrides = {}) {
  return {
    id,
    name: `repo-${id}`,
    fullName: `org/repo-${id}`,
    url: `https://github.com/org/repo-${id}`,
    defaultBranch: 'main',
    platform: 'GITHUB',
    externalId: `ext-${id}`,
    webhookId: null,
    webhookSecret: null,
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('WorkbenchService — 私有辅助方法', () => {
  let svc: WorkbenchService;
  let mockRepositoryService: any;
  let mockSyncService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'mock-token' });
    mockRepositoryService = {
      create: jest.fn(),
    };
    mockSyncService = {
      syncUserRepositories: jest.fn(),
    };
    svc = new WorkbenchService(mockRepositoryService, mockSyncService);
  });

  // ── isUnreadMessage ───────────────────────────────────────────────────────
  describe('isUnreadMessage', () => {
    it('lastReadAt 为 null 时，所有消息均视为未读', () => {
      expect((svc as any).isUnreadMessage(makeDate(), null)).toBe(true);
    });

    it('消息时间晚于 lastReadAt 时为未读', () => {
      const lastRead = makeDate(0);
      const message = makeDate(1000);
      expect((svc as any).isUnreadMessage(message, lastRead)).toBe(true);
    });

    it('消息时间早于或等于 lastReadAt 时为已读', () => {
      const lastRead = makeDate(1000);
      const older = makeDate(0);
      const same = makeDate(1000);
      expect((svc as any).isUnreadMessage(older, lastRead)).toBe(false);
      expect((svc as any).isUnreadMessage(same, lastRead)).toBe(false);
    });
  });

  // ── pickHigherRiskLevel ───────────────────────────────────────────────────
  describe('pickHigherRiskLevel', () => {
    it('任意一侧为 null 时返回另一侧', () => {
      expect((svc as any).pickHigherRiskLevel(null, RiskLevel.HIGH)).toBe(RiskLevel.HIGH);
      expect((svc as any).pickHigherRiskLevel(RiskLevel.LOW, null)).toBe(RiskLevel.LOW);
      expect((svc as any).pickHigherRiskLevel(null, null)).toBeNull();
    });

    it('返回更高风险等级', () => {
      expect((svc as any).pickHigherRiskLevel(RiskLevel.LOW, RiskLevel.HIGH)).toBe(RiskLevel.HIGH);
      expect((svc as any).pickHigherRiskLevel(RiskLevel.CRITICAL, RiskLevel.MEDIUM)).toBe(RiskLevel.CRITICAL);
      expect((svc as any).pickHigherRiskLevel(RiskLevel.HIGH, RiskLevel.HIGH)).toBe(RiskLevel.HIGH);
    });

    it('风险等级顺序为 LOW < MEDIUM < HIGH < CRITICAL', () => {
      const levels = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL];
      for (let i = 0; i < levels.length - 1; i++) {
        expect((svc as any).pickHigherRiskLevel(levels[i], levels[i + 1])).toBe(levels[i + 1]);
      }
    });
  });

  // ── pickLaterDate ─────────────────────────────────────────────────────────
  describe('pickLaterDate', () => {
    it('任意一侧为 null 时返回另一侧', () => {
      const d = makeDate();
      expect((svc as any).pickLaterDate(null, d)).toBe(d);
      expect((svc as any).pickLaterDate(d, null)).toBe(d);
      expect((svc as any).pickLaterDate(null, null)).toBeNull();
    });

    it('返回较晚的日期', () => {
      const earlier = makeDate(0);
      const later = makeDate(5000);
      expect((svc as any).pickLaterDate(earlier, later)).toBe(later);
      expect((svc as any).pickLaterDate(later, earlier)).toBe(later);
    });
  });

  // ── resolveEventMessageTime ───────────────────────────────────────────────
  describe('resolveEventMessageTime', () => {
    it('有 occurredAt 时优先使用 occurredAt', () => {
      const occurredAt = makeDate(0);
      const createdAt = makeDate(9999);
      expect((svc as any).resolveEventMessageTime({ occurredAt, createdAt })).toBe(occurredAt);
    });

    it('occurredAt 为 null 时降级到 createdAt', () => {
      const createdAt = makeDate(1000);
      expect((svc as any).resolveEventMessageTime({ occurredAt: null, createdAt })).toBe(createdAt);
    });
  });

  // ── resolveApprovalRiskLevel ──────────────────────────────────────────────
  describe('resolveApprovalRiskLevel', () => {
    it('有 AI 分析结果时使用分析结果', () => {
      const analyses = [{ riskLevel: RiskLevel.LOW }];
      expect((svc as any).resolveApprovalRiskLevel(analyses, ApprovalStatus.PENDING)).toBe(RiskLevel.LOW);
    });

    it('无分析结果时 PENDING 状态返回 HIGH', () => {
      expect((svc as any).resolveApprovalRiskLevel([], ApprovalStatus.PENDING)).toBe(RiskLevel.HIGH);
      expect((svc as any).resolveApprovalRiskLevel(undefined, ApprovalStatus.PENDING)).toBe(RiskLevel.HIGH);
    });

    it('无分析结果时非 PENDING 状态返回 MEDIUM', () => {
      expect((svc as any).resolveApprovalRiskLevel([], ApprovalStatus.APPROVED)).toBe(RiskLevel.MEDIUM);
    });
  });

  // ── updateConversationLatest ──────────────────────────────────────────────
  describe('updateConversationLatest', () => {
    it('空摘要时直接写入', () => {
      const summary = (svc as any).createEmptyConversationSummary();
      const at = makeDate(1000);
      (svc as any).updateConversationLatest(summary, { messageAt: at, type: 'push', preview: '代码提交' });
      expect(summary.latestMessageAt).toBe(at.toISOString());
      expect(summary.latestMessageType).toBe('push');
      expect(summary.latestMessagePreview).toBe('代码提交');
    });

    it('新消息更晚时覆盖', () => {
      const summary = (svc as any).createEmptyConversationSummary();
      (svc as any).updateConversationLatest(summary, { messageAt: makeDate(1000), type: 'push', preview: '旧' });
      (svc as any).updateConversationLatest(summary, { messageAt: makeDate(2000), type: 'pull_request', preview: '新' });
      expect(summary.latestMessageType).toBe('pull_request');
    });

    it('新消息更早时不覆盖', () => {
      const summary = (svc as any).createEmptyConversationSummary();
      (svc as any).updateConversationLatest(summary, { messageAt: makeDate(2000), type: 'push', preview: '旧（但更晚）' });
      (svc as any).updateConversationLatest(summary, { messageAt: makeDate(500), type: 'pull_request', preview: '新（但更早）' });
      expect(summary.latestMessageType).toBe('push');
    });
  });

  // ── incrementUnread ───────────────────────────────────────────────────────
  describe('incrementUnread', () => {
    it('每次调用 unreadCount +1', () => {
      const summary = (svc as any).createEmptyConversationSummary();
      (svc as any).incrementUnread(summary, RiskLevel.LOW);
      (svc as any).incrementUnread(summary, RiskLevel.HIGH);
      expect(summary.unreadCount).toBe(2);
    });

    it('累积 unreadRiskCounts', () => {
      const summary = (svc as any).createEmptyConversationSummary();
      (svc as any).incrementUnread(summary, RiskLevel.HIGH);
      (svc as any).incrementUnread(summary, RiskLevel.HIGH);
      (svc as any).incrementUnread(summary, RiskLevel.LOW);
      expect(summary.unreadRiskCounts[RiskLevel.HIGH]).toBe(2);
      expect(summary.unreadRiskCounts[RiskLevel.LOW]).toBe(1);
    });

    it('riskLevel 为 null 时计入 LOW 桶', () => {
      const summary = (svc as any).createEmptyConversationSummary();
      (svc as any).incrementUnread(summary, null);
      expect(summary.unreadRiskCounts[RiskLevel.LOW]).toBe(1);
    });

    it('unreadRiskLevel 跟踪最高风险等级', () => {
      const summary = (svc as any).createEmptyConversationSummary();
      (svc as any).incrementUnread(summary, RiskLevel.MEDIUM);
      expect(summary.unreadRiskLevel).toBe(RiskLevel.MEDIUM);
      (svc as any).incrementUnread(summary, RiskLevel.CRITICAL);
      expect(summary.unreadRiskLevel).toBe(RiskLevel.CRITICAL);
      (svc as any).incrementUnread(summary, RiskLevel.LOW);
      expect(summary.unreadRiskLevel).toBe(RiskLevel.CRITICAL);
    });
  });

  describe('watch repositories', () => {
    it('lists starred repository sources with monitoring status', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r2']);
      mockUserRepoFindMany.mockResolvedValue([
        {
          repository: {
            ...makeRepo('r1'),
            _count: { events: 4 },
          },
        },
        {
          repository: {
            ...makeRepo('r2'),
            _count: { events: 9 },
          },
        },
      ]);

      const result = await svc.getWatchRepositories('u1');

      expect(mockUserRepoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            isStarred: true,
            repository: { platform: 'GITHUB' },
          }),
        }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'r1',
          fullName: 'org/repo-r1',
          eventCount: 4,
          isMonitored: false,
          canAddToMonitoring: true,
        }),
        expect.objectContaining({
          id: 'r2',
          fullName: 'org/repo-r2',
          eventCount: 9,
          isMonitored: true,
          canAddToMonitoring: false,
        }),
      ]);
    });

    it('adds a searched repository as a read-only watch source', async () => {
      mockRepositoryService.create.mockResolvedValue({
        ...makeRepo('r3'),
        _count: { events: 0 },
      });

      const dto = { platform: 'GITHUB' as const, owner: 'org', repo: 'repo-r3' };
      const result = await svc.addWatchRepository('u1', dto);

      expect(mockRepositoryService.create).toHaveBeenCalledWith('u1', dto, {
        accessMode: 'MONITOR',
        accessLevel: 'READ',
        role: 'VIEWER',
        isStarred: true,
        userOAuthToken: 'mock-token',
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'r3',
          fullName: 'org/repo-r3',
          isMonitored: false,
          canAddToMonitoring: true,
        }),
      );
    });
  });
});

// ── getWatchFeed 过滤逻辑 ─────────────────────────────────────────────────
describe('WorkbenchService.getWatchFeed', () => {
  let svc: WorkbenchService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new WorkbenchService({} as any, {} as any);
    mockGetUserMonitoredRepositoryIds.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([]);
  });

  it('editable 仓库不出现在 watchFeed 中', async () => {
    // Prisma 会通过 accessLevel: { notIn: editableAccessLevels } 过滤掉 editable 仓库
    // mock 模拟 Prisma 过滤后的结果
    mockUserRepoFindMany.mockResolvedValue([]);

    const result = await svc.getWatchFeed('user-1');
    expect(result.items).toHaveLength(0);
    expect(mockEventFindMany).not.toHaveBeenCalled();
    // 验证 Prisma 确实用了 accessLevel notIn 过滤
    expect(mockUserRepoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accessLevel: expect.objectContaining({ notIn: expect.any(Array) }),
        }),
      }),
    );
  });

  it('已纳入监控的仓库不出现在 watchFeed 中', async () => {
    mockGetUserMonitoredRepositoryIds.mockResolvedValue(['repo-monitored']);
    // Prisma 会通过 repositoryId: { notIn: monitoredIds } 过滤掉已监控仓库
    // mock 模拟 Prisma 过滤后的结果
    mockUserRepoFindMany.mockResolvedValue([]);

    const result = await svc.getWatchFeed('user-1');
    expect(result.items).toHaveLength(0);
    expect(mockEventFindMany).not.toHaveBeenCalled();
    // 验证 Prisma 确实传入了 notIn 过滤参数
    expect(mockUserRepoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          repositoryId: { notIn: ['repo-monitored'] },
        }),
      }),
    );
  });

  it('非 editable 且未监控的仓库出现在 watchFeed 中', async () => {
    mockUserRepoFindMany.mockResolvedValue([
      {
        repositoryId: 'repo-watch',
        accessLevel: 'READ',
        repository: { id: 'repo-watch', fullName: 'org/watch-repo' },
      },
    ]);
    mockEventFindMany.mockResolvedValue([
      {
        id: 'evt-1',
        repositoryId: 'repo-watch',
        type: 'PUSH',
        title: 'Push event',
        body: 'some body',
        author: 'dev',
        authorAvatar: null,
        occurredAt: new Date('2025-01-01'),
        createdAt: new Date('2025-01-01'),
        externalUrl: null,
        analyses: [],
        repository: { fullName: 'org/watch-repo' },
      },
    ]);

    const result = await svc.getWatchFeed('user-1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].repositoryFullName).toBe('org/watch-repo');
  });

  it('用户无任何仓库时返回空列表', async () => {
    mockUserRepoFindMany.mockResolvedValue([]);
    const result = await svc.getWatchFeed('user-1');
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

// ── markConversationAsRead ────────────────────────────────────────────────
describe('WorkbenchService.markConversationAsRead', () => {
  let svc: WorkbenchService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new WorkbenchService({} as any, {} as any);
    mockAssertUserCanAccessRepository.mockResolvedValue({ accessLevel: 'READ' });
    mockConversationStateFindUnique.mockResolvedValue(null);
    mockEventFindFirst.mockResolvedValue(null);
    mockApprovalFindFirst.mockResolvedValue(null);
  });

  it('payload 提供 readAt 时以 readAt 为准', async () => {
    const readAt = '2025-06-01T10:00:00.000Z';
    mockConversationStateUpsert.mockResolvedValue({
      userId: 'u1',
      repositoryId: 'r1',
      lastReadAt: new Date(readAt),
      lastViewedAt: new Date(),
    });

    const result = await svc.markConversationAsRead('u1', 'r1', { readAt });
    expect(result.success).toBe(true);
    const upsertCall = mockConversationStateUpsert.mock.calls[0][0];
    expect(upsertCall.create.lastReadAt).toEqual(new Date(readAt));
  });

  it('payload 提供 upToMessageAt 时优先于 readAt', async () => {
    const readAt = '2025-01-01T00:00:00.000Z';
    const upToMessageAt = '2025-06-15T12:00:00.000Z';
    mockConversationStateUpsert.mockResolvedValue({
      userId: 'u1',
      repositoryId: 'r1',
      lastReadAt: new Date(upToMessageAt),
      lastViewedAt: new Date(),
    });

    await svc.markConversationAsRead('u1', 'r1', { readAt, upToMessageAt });
    const upsertCall = mockConversationStateUpsert.mock.calls[0][0];
    expect(upsertCall.create.lastReadAt).toEqual(new Date(upToMessageAt));
  });

  it('不回退已有 lastReadAt（取较晚时间）', async () => {
    const existingReadAt = new Date('2025-12-01T00:00:00.000Z');
    mockConversationStateFindUnique.mockResolvedValue({ lastReadAt: existingReadAt });
    mockConversationStateUpsert.mockResolvedValue({
      userId: 'u1',
      repositoryId: 'r1',
      lastReadAt: existingReadAt,
      lastViewedAt: new Date(),
    });

    // 传入更早的时间
    await svc.markConversationAsRead('u1', 'r1', { readAt: '2025-01-01T00:00:00.000Z' });
    const upsertCall = mockConversationStateUpsert.mock.calls[0][0];
    // lastReadAt 应保持原有的更晚时间
    expect(upsertCall.update.lastReadAt).toEqual(existingReadAt);
  });
});
