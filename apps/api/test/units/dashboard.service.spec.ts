import { DashboardService } from '../../src/modules/dashboard/dashboard.service';

const mockRepoFindMany = jest.fn();
const mockEventCount = jest.fn();
const mockEventFindMany = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    PR_REVIEW: 'PR_REVIEW',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
    ISSUE_COMMENT: 'ISSUE_COMMENT',
    RELEASE: 'RELEASE',
    BRANCH_CREATED: 'BRANCH_CREATED',
    BRANCH_DELETED: 'BRANCH_DELETED',
  },
  Prisma: {},
  prisma: {
    repository: {
      findMany: (...a: any[]) => mockRepoFindMany(...a),
    },
    event: {
      count: (...a: any[]) => mockEventCount(...a),
      findMany: (...a: any[]) => mockEventFindMany(...a),
    },
  },
}));

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DashboardService();
  });

  // ── getOverview ────────────────────────────────────────────────────────────
  describe('getOverview', () => {
    it('returns zero stats when user has no repositories', async () => {
      mockRepoFindMany.mockResolvedValue([]);
      const result = await service.getOverview('u1');
      expect(result).toEqual({ totalRepositories: 0, openPRs: 0, commitsToday: 0, openIssues: 0 });
      expect(mockEventCount).not.toHaveBeenCalled();
    });

    it('returns aggregate counts for all accessible repositories', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      mockEventCount
        .mockResolvedValueOnce(5)  // openPRs
        .mockResolvedValueOnce(12) // commitsToday
        .mockResolvedValueOnce(3); // openIssues
      const result = await service.getOverview('u1');
      expect(result).toEqual({ totalRepositories: 2, openPRs: 5, commitsToday: 12, openIssues: 3 });
    });

    it('filters repositories when repositoryIdsParam provided', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
      mockEventCount.mockResolvedValue(0);
      const result = await service.getOverview('u1', 'r1,r3');
      expect(result.totalRepositories).toBe(2);
    });

    it('returns zero stats when requested repositoryIds not in accessible set', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }]);
      const result = await service.getOverview('u1', 'r99');
      expect(result).toEqual({ totalRepositories: 0, openPRs: 0, commitsToday: 0, openIssues: 0 });
    });

    it('returns empty repos when repositoryIdsParam is blank entries', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }]);
      const result = await service.getOverview('u1', ',  ,');
      expect(result.totalRepositories).toBe(0);
    });
  });

  // ── getActivity ────────────────────────────────────────────────────────────
  describe('getActivity', () => {
    it('returns empty day buckets when user has no repositories', async () => {
      mockRepoFindMany.mockResolvedValue([]);
      const result = await service.getActivity('u1', 3);
      expect(result).toHaveLength(3);
      expect(result.every((d: any) => d.commits === 0 && d.prs === 0 && d.issues === 0)).toBe(true);
    });

    it('counts PUSH as commits', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }]);
      const today = new Date();
      mockEventFindMany.mockResolvedValue([
        { type: 'PUSH', occurredAt: today },
        { type: 'PUSH', occurredAt: today },
      ]);
      const result = await service.getActivity('u1', 7);
      const todayKey = today.toLocaleDateString('en-US', { weekday: 'short' });
      const todayEntry = result.find((d: any) => d.date === todayKey);
      expect(todayEntry?.commits).toBe(2);
    });

    it('counts PR_OPENED, PR_MERGED, PR_CLOSED as prs', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }]);
      const today = new Date();
      mockEventFindMany.mockResolvedValue([
        { type: 'PR_OPENED', occurredAt: today },
        { type: 'PR_MERGED', occurredAt: today },
        { type: 'PR_CLOSED', occurredAt: today },
      ]);
      const result = await service.getActivity('u1', 7);
      const todayKey = today.toLocaleDateString('en-US', { weekday: 'short' });
      const todayEntry = result.find((d: any) => d.date === todayKey);
      expect(todayEntry?.prs).toBe(3);
    });

    it('counts ISSUE_OPENED and ISSUE_CLOSED as issues', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }]);
      const today = new Date();
      mockEventFindMany.mockResolvedValue([
        { type: 'ISSUE_OPENED', occurredAt: today },
        { type: 'ISSUE_CLOSED', occurredAt: today },
      ]);
      const result = await service.getActivity('u1', 7);
      const todayKey = today.toLocaleDateString('en-US', { weekday: 'short' });
      const todayEntry = result.find((d: any) => d.date === todayKey);
      expect(todayEntry?.issues).toBe(2);
    });

    it('ignores events with null occurredAt', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }]);
      mockEventFindMany.mockResolvedValue([
        { type: 'PUSH', occurredAt: null },
      ]);
      const result = await service.getActivity('u1', 7);
      expect(result.every((d: any) => d.commits === 0)).toBe(true);
    });

    it('ignores events with unknown type (no bucket increment)', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1' }]);
      const today = new Date();
      mockEventFindMany.mockResolvedValue([
        { type: 'RELEASE', occurredAt: today },
        { type: 'BRANCH_CREATED', occurredAt: today },
      ]);
      const result = await service.getActivity('u1', 7);
      expect(result.every((d: any) => d.commits === 0 && d.prs === 0 && d.issues === 0)).toBe(true);
    });

    it('defaults to 7 days when no days param provided', async () => {
      mockRepoFindMany.mockResolvedValue([]);
      const result = await service.getActivity('u1');
      expect(result).toHaveLength(7);
    });
  });

  // ── getRecentActivity ──────────────────────────────────────────────────────
  describe('getRecentActivity', () => {
    it('returns empty array when no repositories accessible', async () => {
      mockRepoFindMany.mockResolvedValue([]);
      const result = await service.getRecentActivity('u1');
      expect(result).toEqual([]);
    });

    it('maps events to activity items with repo name', async () => {
      mockRepoFindMany.mockResolvedValue([
        { id: 'r1', name: 'repo', fullName: 'org/repo' },
      ]);
      const occurredAt = new Date('2024-01-01T12:00:00Z');
      mockEventFindMany.mockResolvedValue([
        {
          id: 'e1', type: 'PUSH', action: 'push', title: 'Push to main',
          author: 'alice', repositoryId: 'r1', occurredAt,
          branch: 'main', sourceBranch: null, targetBranch: null, branches: [],
        },
      ]);
      const result = await service.getRecentActivity('u1') as any[];
      expect(result).toHaveLength(1);
      expect(result[0].repo).toBe('org/repo');
      expect(result[0].occurredAt).toBe(occurredAt.toISOString());
      expect(result[0].time).toBeDefined();
    });

    it('uses name when fullName is missing', async () => {
      mockRepoFindMany.mockResolvedValue([
        { id: 'r1', name: 'my-repo', fullName: null },
      ]);
      const occurredAt = new Date();
      mockEventFindMany.mockResolvedValue([
        { id: 'e1', type: 'PUSH', action: null, title: null, author: null, repositoryId: 'r1', occurredAt, branch: null, sourceBranch: null, targetBranch: null, branches: [] },
      ]);
      const result = await service.getRecentActivity('u1') as any[];
      expect(result[0].repo).toBe('my-repo');
    });

    it('sets occurredAt to null when event.occurredAt is null', async () => {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1', name: 'r', fullName: 'o/r' }]);
      mockEventFindMany.mockResolvedValue([
        { id: 'e1', type: 'PUSH', action: null, title: null, author: null, repositoryId: 'r1', occurredAt: null, branch: null, sourceBranch: null, targetBranch: null, branches: [] },
      ]);
      const result = await service.getRecentActivity('u1') as any[];
      expect(result[0].occurredAt).toBeNull();
    });

    it('filters out repositories not in scope when repositoryIdsParam given', async () => {
      mockRepoFindMany.mockResolvedValue([
        { id: 'r1', name: 'repo1', fullName: 'o/r1' },
        { id: 'r2', name: 'repo2', fullName: 'o/r2' },
      ]);
      mockEventFindMany.mockResolvedValue([]);
      await service.getRecentActivity('u1', 10, 'r1');
      // r2 is filtered out, only r1 events queried
      expect(mockEventFindMany).toHaveBeenCalled();
    });
  });

  // ── getRelativeTime (tested via getRecentActivity) ─────────────────────────
  describe('getRelativeTime', () => {
    async function getTime(date: Date) {
      mockRepoFindMany.mockResolvedValue([{ id: 'r1', name: 'r', fullName: 'o/r' }]);
      mockEventFindMany.mockResolvedValue([
        { id: 'e1', type: 'PUSH', action: null, title: null, author: null, repositoryId: 'r1', occurredAt: date, branch: null, sourceBranch: null, targetBranch: null, branches: [] },
      ]);
      const result = await service.getRecentActivity('u1') as any[];
      return result[0].time as string;
    }

    it('returns "just now" for very recent events', async () => {
      expect(await getTime(new Date())).toBe('just now');
    });

    it('returns "X min ago" for events within the hour', async () => {
      const d = new Date(Date.now() - 5 * 60 * 1000);
      expect(await getTime(d)).toMatch(/min ago/);
    });

    it('returns "X hour(s) ago" for events within 24 hours', async () => {
      const d = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const time = await getTime(d);
      expect(time).toMatch(/hour/);
    });

    it('returns "1 hour ago" (singular) for exactly 1 hour', async () => {
      const d = new Date(Date.now() - 61 * 60 * 1000);
      const time = await getTime(d);
      expect(time).toBe('1 hour ago');
    });

    it('returns "X days ago" for events within a week', async () => {
      const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(await getTime(d)).toMatch(/days ago/);
    });

    it('returns "1 day ago" (singular) for exactly 1 day', async () => {
      const d = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const time = await getTime(d);
      expect(time).toBe('1 day ago');
    });

    it('returns locale date string for events older than a week', async () => {
      const d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const time = await getTime(d);
      expect(time).toBe(d.toLocaleDateString());
    });
  });
});
