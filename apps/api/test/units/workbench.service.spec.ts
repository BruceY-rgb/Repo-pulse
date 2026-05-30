import { WorkbenchService } from '../../src/modules/workbench/workbench.service';

const mockPrismaUserRepoFindMany = jest.fn();
const mockPrismaRepoFindUnique = jest.fn();
const mockPrismaEventFindMany = jest.fn();
const mockPrismaEventFindFirst = jest.fn();
const mockPrismaApprovalFindMany = jest.fn();
const mockPrismaApprovalFindFirst = jest.fn();
const mockPrismaNotificationFindMany = jest.fn();
const mockPrismaAIAnalysisFindMany = jest.fn();
const mockPrismaUserFindUnique = jest.fn();
const mockPrismaConversationStateFindMany = jest.fn();
const mockPrismaConversationStateFindUnique = jest.fn();
const mockPrismaConversationStateUpsert = jest.fn();
const mockRepositoryCreate = jest.fn();

const mockGetUserMonitoredRepositoryIds = jest.fn();
const mockAssertUserCanAccessRepository = jest.fn();
const mockIsEditableRepositoryAccessLevel = jest.fn(
  (level: string) => ['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE'].includes(level),
);

jest.mock('../../src/common/utils/repository-access', () => ({
  assertUserCanAccessRepository: (...a: any[]) => mockAssertUserCanAccessRepository(...a),
  getUserMonitoredRepositoryIds: (...a: any[]) => mockGetUserMonitoredRepositoryIds(...a),
  isEditableRepositoryAccessLevel: (level: string) => mockIsEditableRepositoryAccessLevel(level),
}));

jest.mock('@repo-pulse/database', () => ({
  ApprovalStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
  },
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    PR_REVIEW: 'PR_REVIEW',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
    ISSUE_COMMENT: 'ISSUE_COMMENT',
    BRANCH_CREATED: 'BRANCH_CREATED',
    BRANCH_DELETED: 'BRANCH_DELETED',
    RELEASE: 'RELEASE',
  },
  RepositoryAccessLevel: {
    OWNER: 'OWNER',
    ADMIN: 'ADMIN',
    MAINTAIN: 'MAINTAIN',
    WRITE: 'WRITE',
    TRIAGE: 'TRIAGE',
    READ: 'READ',
    NONE: 'NONE',
  },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  NotificationChannel: { IN_APP: 'IN_APP', EMAIL: 'EMAIL' },
  prisma: {
    userRepository: {
      findMany: (...a: any[]) => mockPrismaUserRepoFindMany(...a),
    },
    repository: {
      findUnique: (...a: any[]) => mockPrismaRepoFindUnique(...a),
    },
    event: {
      findMany: (...a: any[]) => mockPrismaEventFindMany(...a),
      findFirst: (...a: any[]) => mockPrismaEventFindFirst(...a),
    },
    approval: {
      findMany: (...a: any[]) => mockPrismaApprovalFindMany(...a),
      findFirst: (...a: any[]) => mockPrismaApprovalFindFirst(...a),
    },
    notification: {
      findMany: (...a: any[]) => mockPrismaNotificationFindMany(...a),
    },
    aIAnalysis: {
      findMany: (...a: any[]) => mockPrismaAIAnalysisFindMany(...a),
    },
    user: {
      findUnique: (...a: any[]) => mockPrismaUserFindUnique(...a),
    },
    userRepositoryConversationState: {
      findMany: (...a: any[]) => mockPrismaConversationStateFindMany(...a),
      findUnique: (...a: any[]) => mockPrismaConversationStateFindUnique(...a),
      upsert: (...a: any[]) => mockPrismaConversationStateUpsert(...a),
    },
  },
}));

function makeUserRepo(repositoryId: string, accessLevel: string, accessMode: string, overrides = {}) {
  return {
    userId: 'u1',
    repositoryId,
    accessLevel,
    accessMode,
    role: 'member',
    isStarred: false,
    createdAt: new Date('2025-01-01'),
    repository: makeRepo(repositoryId, overrides),
    ...overrides,
  };
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

function makeEvent(repositoryId: string, type: string, overrides = {}) {
  return {
    id: `evt-${repositoryId}`,
    repositoryId,
    type,
    action: 'opened',
    title: `Event in ${repositoryId}`,
    body: 'Some event body',
    author: 'testuser',
    authorAvatar: null,
    externalId: `ext-evt-${repositoryId}`,
    externalUrl: `https://github.com/org/repo-${repositoryId}/issues/1`,
    branch: null,
    sourceBranch: null,
    targetBranch: null,
    branches: [],
    metadata: {},
    rawPayload: null,
    occurredAt: new Date('2025-06-01'),
    createdAt: new Date('2025-06-01'),
    approvals: [],
    analyses: [],
    ...overrides,
  };
}

function makeApproval(eventId: string, status: string, repositoryId: string, overrides = {}) {
  return {
    id: `appr-${eventId}`,
    eventId,
    status,
    originalContent: 'Original',
    editedContent: null,
    comment: null,
    reviewerId: null,
    reviewedAt: null,
    createdAt: new Date('2025-06-01'),
    event: {
      id: eventId,
      title: `Event ${eventId}`,
      body: 'Body',
      author: 'author',
      authorAvatar: null,
      externalUrl: `https://github.com/org/repo-${repositoryId}/issues/1`,
      repositoryId,
    },
    reviewer: null,
    ...overrides,
  };
}

describe('WorkbenchService', () => {
  let service: WorkbenchService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMonitoredRepositoryIds.mockResolvedValue([]);
    mockAssertUserCanAccessRepository.mockResolvedValue({
      repositoryId: 'r1',
      accessLevel: 'WRITE',
      accessMode: 'EDITABLE',
      role: 'admin',
    });
    mockPrismaUserFindUnique.mockResolvedValue({ preferences: {} });
    mockPrismaEventFindMany.mockResolvedValue([]);
    mockPrismaEventFindFirst.mockResolvedValue(null);
    mockPrismaNotificationFindMany.mockResolvedValue([]);
    mockPrismaAIAnalysisFindMany.mockResolvedValue([]);
    mockPrismaRepoFindUnique.mockResolvedValue(makeRepo('r1'));
    mockPrismaApprovalFindMany.mockResolvedValue([]);
    mockPrismaApprovalFindFirst.mockResolvedValue(null);
    mockPrismaConversationStateFindMany.mockResolvedValue([]);
    mockPrismaConversationStateFindUnique.mockResolvedValue(null);
    mockPrismaConversationStateUpsert.mockResolvedValue({
      userId: 'u1',
      repositoryId: 'r1',
      lastReadAt: new Date('2025-06-01'),
      lastViewedAt: new Date('2025-06-01'),
      createdAt: new Date('2025-06-01'),
      updatedAt: new Date('2025-06-01'),
    });
    mockRepositoryCreate.mockResolvedValue(makeRepo('r1'));
    service = new WorkbenchService(
      { create: mockRepositoryCreate } as never,
      {} as never,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getChatRepositories
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getChatRepositories', () => {
    it('returns empty groups when user has no repositories', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([]);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories).toEqual([]);
      expect(result.monitoredRepositories).toEqual([]);
    });

    it('groups WRITE-level repos as editable', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r1', 'WRITE', 'EDITABLE'),
      ]);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories).toHaveLength(1);
      expect(result.monitoredRepositories).toHaveLength(0);
      expect(result.editableRepositories[0].repository.canOperate).toBe(true);
      expect(result.editableRepositories[0].repository.isEditable).toBe(true);
      expect(result.editableRepositories[0].kind).toBe('editable');
    });

    it('groups OWNER/ADMIN/MAINTAIN repos as editable', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r1', 'OWNER', 'EDITABLE'),
        makeUserRepo('r2', 'ADMIN', 'EDITABLE'),
        makeUserRepo('r3', 'MAINTAIN', 'EDITABLE'),
      ]);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories).toHaveLength(3);
      result.editableRepositories.forEach((item) => {
        expect(item.repository.canOperate).toBe(true);
        expect(item.kind).toBe('editable');
      });
    });

    it('groups READ-level repos as monitored-readonly', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r1', 'READ', 'MONITOR'),
      ]);
      // READ-level repos need to be in user's monitoring scope to appear as monitored
      mockPrismaUserFindUnique.mockResolvedValue({
        preferences: { monitoringScope: { repositoryIds: ['r1'] } },
      });
      // Re-mock the actual getUserMonitoredRepositoryIds to return r1
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r1']);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories).toHaveLength(0);
      expect(result.monitoredRepositories).toHaveLength(1);
      expect(result.monitoredRepositories[0].repository.canOperate).toBe(false);
      expect(result.monitoredRepositories[0].kind).toBe('monitored-readonly');
    });

    it('mixes editable and monitored repos correctly', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r1', 'WRITE', 'EDITABLE'),
        makeUserRepo('r2', 'READ', 'MONITOR'),
        makeUserRepo('r3', 'OWNER', 'EDITABLE'),
        makeUserRepo('r4', 'TRIAGE', 'MONITOR'),
      ]);
      // monitored repos require being in monitoring scope
      mockPrismaUserFindUnique.mockResolvedValue({
        preferences: { monitoringScope: { repositoryIds: ['r2', 'r4'] } },
      });
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r2', 'r4']);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories).toHaveLength(2);
      expect(result.monitoredRepositories).toHaveLength(2);

      const editableIds = result.editableRepositories.map((r) => r.repository.id);
      expect(editableIds).toContain('r1');
      expect(editableIds).toContain('r3');
    });

    it('includes latestMessageAt and preview from events', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r1', 'WRITE', 'EDITABLE'),
      ]);
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'PUSH', {
          body: 'Latest commit message',
          occurredAt: new Date('2025-06-15'),
          createdAt: new Date('2025-06-15'),
        }),
      ]);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories[0].latestMessageAt).toBeTruthy();
      expect(result.editableRepositories[0].latestMessagePreview).toBe('Latest commit message');
    });

    it('includes unread message counts', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r1', 'WRITE', 'EDITABLE'),
      ]);
      mockPrismaConversationStateFindMany.mockResolvedValue([
        {
          repositoryId: 'r1',
          lastReadAt: new Date('2025-06-10'),
          lastViewedAt: new Date('2025-06-10'),
        },
      ]);
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'PUSH', {
          id: 'evt-r1-1',
          occurredAt: new Date('2025-06-11'),
          createdAt: new Date('2025-06-11'),
        }),
        makeEvent('r1', 'ISSUE_OPENED', {
          id: 'evt-r1-2',
          occurredAt: new Date('2025-06-12'),
          createdAt: new Date('2025-06-12'),
        }),
      ]);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories[0].unreadCount).toBe(2);
    });

    it('includes high risk analysis counts', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r1', 'WRITE', 'EDITABLE'),
      ]);
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'PUSH', {
          analyses: [{ status: 'COMPLETED', riskLevel: 'HIGH' }],
        }),
      ]);

      const result = await service.getChatRepositories('u1');

      expect(result.editableRepositories[0].highRiskCount).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getConversationMessages
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getConversationMessages', () => {
    beforeEach(() => {
      mockAssertUserCanAccessRepository.mockResolvedValue({
        repositoryId: 'r1',
        accessLevel: 'WRITE',
        accessMode: 'EDITABLE',
        role: 'admin',
      });
      mockPrismaRepoFindUnique.mockResolvedValue(makeRepo('r1'));
    });

    it('sets repositoryCanOperate=true for WRITE access level', async () => {
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'ISSUE_OPENED'),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].repositoryCanOperate).toBe(true);
      expect(result.messages[0].actions).toBeDefined();
    });

    it('sets repositoryCanOperate=false for READ access level', async () => {
      mockAssertUserCanAccessRepository.mockResolvedValue({
        repositoryId: 'r1',
        accessLevel: 'READ',
        accessMode: 'MONITOR',
        role: 'viewer',
      });
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'ISSUE_OPENED'),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].repositoryCanOperate).toBe(false);
    });

    it('includes base actions (open_github, ai_analyze) for all messages', async () => {
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'ISSUE_OPENED', {
          externalUrl: 'https://github.com/org/repo-r1/issues/1',
        }),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');

      const actions = result.messages[0].actions;
      const githubAction = actions?.find((a) => a.key === 'open_github');
      const aiAction = actions?.find((a) => a.key === 'ai_analyze');

      expect(githubAction).toBeDefined();
      expect(githubAction?.requiresPermission).toBe(false);
      expect(aiAction).toBeDefined();
      expect(aiAction?.requiresPermission).toBe(false);
    });

    it('includes agent_handle action only when repositoryCanOperate=true', async () => {
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'ISSUE_OPENED'),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');
      const agentAction = result.messages[0].actions?.find((a) => a.key === 'agent_handle');
      expect(agentAction).toBeDefined();
      expect(agentAction?.requiresPermission).toBe(true);
    });

    it('does NOT include agent_handle action when repositoryCanOperate=false', async () => {
      mockAssertUserCanAccessRepository.mockResolvedValue({
        repositoryId: 'r1',
        accessLevel: 'READ',
        accessMode: 'MONITOR',
        role: 'viewer',
      });
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'ISSUE_OPENED'),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');
      const agentAction = result.messages[0].actions?.find((a) => a.key === 'agent_handle');
      expect(agentAction).toBeUndefined();
    });

    it('includes approval actions (approve/reject) for PENDING approvals when canOperate=true', async () => {
      const pendingApproval = {
        id: 'appr-1',
        status: 'PENDING',
        reviewerId: null,
      };
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'PR_OPENED', { approvals: [pendingApproval] }),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');
      const approveAction = result.messages[0].actions?.find((a) => a.key === 'approve');
      const rejectAction = result.messages[0].actions?.find((a) => a.key === 'reject');

      expect(approveAction).toBeDefined();
      expect(approveAction?.requiresPermission).toBe(true);
      expect(rejectAction).toBeDefined();
      expect(rejectAction?.requiresPermission).toBe(true);
    });

    it('does NOT include approval actions when canOperate=false', async () => {
      mockAssertUserCanAccessRepository.mockResolvedValue({
        repositoryId: 'r1',
        accessLevel: 'READ',
        accessMode: 'MONITOR',
        role: 'viewer',
      });
      const pendingApproval = {
        id: 'appr-1',
        status: 'PENDING',
        reviewerId: null,
      };
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'PR_OPENED', { approvals: [pendingApproval] }),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');
      const approveAction = result.messages[0].actions?.find((a) => a.key === 'approve');
      expect(approveAction).toBeUndefined();
    });

    it('returns approval messages with correct type and actions', async () => {
      mockPrismaEventFindMany.mockResolvedValue([]);
      mockPrismaApprovalFindMany.mockResolvedValue([
        makeApproval('evt-r1', 'PENDING', 'r1'),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('approval');
      expect(result.messages[0].repositoryCanOperate).toBe(true);
      const approveAction = result.messages[0].actions?.find((a) => a.key === 'approve');
      expect(approveAction).toBeDefined();
    });

    it('sorts messages by createdAt descending', async () => {
      mockPrismaEventFindMany.mockResolvedValue([
        makeEvent('r1', 'ISSUE_OPENED', {
          id: 'evt-old',
          occurredAt: new Date('2025-01-01'),
          createdAt: new Date('2025-01-01'),
        }),
        makeEvent('r1', 'PR_OPENED', {
          id: 'evt-new',
          occurredAt: new Date('2025-12-01'),
          createdAt: new Date('2025-12-01'),
        }),
      ]);

      const result = await service.getConversationMessages('u1', 'r1');

      expect(new Date(result.messages[0].createdAt).getTime()).toBeGreaterThan(
        new Date(result.messages[1].createdAt).getTime(),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getWatchFeed
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getWatchFeed', () => {
    beforeEach(() => {
      // Prisma returns only starred, non-editable, unmonitored memberships for the feed.
      mockPrismaUserRepoFindMany.mockResolvedValue([
        makeUserRepo('r2', 'READ', 'MONITOR', { isStarred: true }),
      ]);
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r3']); // monitored via preferences
    });

    it('queries only starred, non-editable, unmonitored repositories', async () => {
      mockPrismaEventFindMany.mockResolvedValue([]);

      const result = await service.getWatchFeed('u1');

      const membershipQuery = mockPrismaUserRepoFindMany.mock.calls[0]?.[0];
      expect(membershipQuery.where).toMatchObject({
        userId: 'u1',
        isStarred: true,
        repository: { platform: 'GITHUB' },
        repositoryId: { notIn: ['r3'] },
      });
      expect(membershipQuery.where.accessLevel.notIn).toEqual(
        expect.arrayContaining(['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE']),
      );
      expect(result.items).toEqual([]);
    });

    it('returns events from candidate repositories only', async () => {
      mockPrismaEventFindMany.mockResolvedValue([
        {
          id: 'evt-r2',
          repositoryId: 'r2',
          repository: { id: 'r2', fullName: 'org/repo-r2' },
          type: 'ISSUE_OPENED',
          title: 'Bug fix',
          body: 'Fixing a bug',
          author: 'dev',
          authorAvatar: null,
          externalUrl: 'https://github.com/org/repo-r2/issues/1',
          occurredAt: new Date('2025-06-01'),
          createdAt: new Date('2025-06-01'),
          analyses: [],
        },
      ]);

      const result = await service.getWatchFeed('u1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].repositoryId).toBe('r2');
      expect(result.items[0].canAddToMonitoring).toBe(true);
    });

    it('filters events by type parameter', async () => {
      mockPrismaEventFindMany.mockResolvedValue([]);

      await service.getWatchFeed('u1', 'issue');

      // Verify the type filter was passed to prisma
      const eventQuery = mockPrismaEventFindMany.mock.calls[0]?.[0];
      expect(eventQuery.where.type).toBeDefined();
      expect(eventQuery.where.type.in).toContain('ISSUE_OPENED');
    });

    it('returns nextCursor for pagination', async () => {
      mockPrismaEventFindMany.mockResolvedValue(
        Array.from({ length: 21 }, (_, i) => ({
          id: `evt-r2-${i}`,
          repositoryId: 'r2',
          repository: { id: 'r2', fullName: 'org/repo-r2' },
          type: 'PUSH',
          title: `Commit ${i}`,
          body: `Body ${i}`,
          author: 'dev',
          authorAvatar: null,
          externalUrl: null,
          occurredAt: new Date(`2025-06-${String(i + 1).padStart(2, '0')}`),
          createdAt: new Date(`2025-06-${String(i + 1).padStart(2, '0')}`),
          analyses: [],
        })),
      );

      const result = await service.getWatchFeed('u1', undefined, undefined, 20);

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBeTruthy();
    });

    it('returns empty when no candidate repos', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([]);
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r1']);

      const result = await service.getWatchFeed('u1');

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(mockPrismaEventFindMany).not.toHaveBeenCalled();
    });

    it('excludes monitored starred repositories from feed candidates', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([]);
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r2']);

      await service.getWatchFeed('u1');

      const membershipQuery = mockPrismaUserRepoFindMany.mock.calls[0]?.[0];
      expect(membershipQuery.where.repositoryId).toEqual({ notIn: ['r2'] });
    });

    it('excludes editable starred repositories from feed candidates', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([]);

      await service.getWatchFeed('u1');

      const membershipQuery = mockPrismaUserRepoFindMany.mock.calls[0]?.[0];
      expect(membershipQuery.where.accessLevel.notIn).toEqual(
        expect.arrayContaining(['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE']),
      );
    });

    it('excludes non-starred read-only repositories from feed candidates', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([]);

      await service.getWatchFeed('u1');

      const membershipQuery = mockPrismaUserRepoFindMany.mock.calls[0]?.[0];
      expect(membershipQuery.where.isStarred).toBe(true);
    });

    it('limits watch feed candidates to GitHub starred repositories', async () => {
      mockPrismaUserRepoFindMany.mockResolvedValue([]);

      await service.getWatchFeed('u1');

      const membershipQuery = mockPrismaUserRepoFindMany.mock.calls[0]?.[0];
      expect(membershipQuery.where.repository).toEqual({ platform: 'GITHUB' });
    });

    it('includes aiInsight from completed analyses', async () => {
      mockPrismaEventFindMany.mockResolvedValue([
        {
          id: 'evt-r2',
          repositoryId: 'r2',
          repository: { id: 'r2', fullName: 'org/repo-r2' },
          type: 'PR_OPENED',
          title: 'New feature',
          body: 'Adding feature X',
          author: 'dev',
          authorAvatar: null,
          externalUrl: null,
          occurredAt: new Date('2025-06-01'),
          createdAt: new Date('2025-06-01'),
          analyses: [{ summary: 'This PR may affect authentication module' }],
        },
      ]);

      const result = await service.getWatchFeed('u1');

      expect(result.items[0].aiInsight).toBe('This PR may affect authentication module');
    });
  });

  describe('watch repositories', () => {
    it('lists starred repository sources with monitoring status', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r2']);
      mockPrismaUserRepoFindMany.mockResolvedValue([
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

      const result = await service.getWatchRepositories('u1');

      expect(mockPrismaUserRepoFindMany).toHaveBeenCalledWith(
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
      mockRepositoryCreate.mockResolvedValue({
        ...makeRepo('r3'),
        _count: { events: 0 },
      });

      const dto = { platform: 'GITHUB' as const, owner: 'org', repo: 'repo-r3' };
      const result = await service.addWatchRepository('u1', dto);

      expect(mockRepositoryCreate).toHaveBeenCalledWith('u1', dto, {
        accessMode: 'MONITOR',
        accessLevel: 'READ',
        role: 'VIEWER',
        isStarred: true,
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
