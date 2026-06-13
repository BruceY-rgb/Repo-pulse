import { SyncService } from '../../src/modules/sync/sync.service';

const mockUserFindUnique = jest.fn();
const mockRepoFindFirst = jest.fn();
const mockRepoFindMany = jest.fn();
const mockRepoUpdate = jest.fn();
const mockUserRepoFindUnique = jest.fn();
const mockUserRepoCreate = jest.fn();
const mockUserRepoUpdate = jest.fn();
const mockUserRepoUpdateMany = jest.fn();
const mockEventFindFirst = jest.fn();
const mockEventCreate = jest.fn();
const mockGetUserMonitoredRepositoryIds = jest.fn();

jest.mock('../../src/common/utils/repository-access', () => ({
  getUserMonitoredRepositoryIds: (...a: any[]) => mockGetUserMonitoredRepositoryIds(...a),
}));

jest.mock('@repo-pulse/database', () => ({
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
  },
  Platform: { GITHUB: 'GITHUB' },
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { IN_APP: 'IN_APP', EMAIL: 'EMAIL' },
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  prisma: {
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    repository: {
      findFirst: (...a: any[]) => mockRepoFindFirst(...a),
      findMany: (...a: any[]) => mockRepoFindMany(...a),
      findUnique: (...a: any[]) => mockRepoFindMany(...a),
      update: (...a: any[]) => mockRepoUpdate(...a),
    },
    userRepository: {
      findUnique: (...a: any[]) => mockUserRepoFindUnique(...a),
      create: (...a: any[]) => mockUserRepoCreate(...a),
      update: (...a: any[]) => mockUserRepoUpdate(...a),
      updateMany: (...a: any[]) => mockUserRepoUpdateMany(...a),
    },
    event: {
      findFirst: (...a: any[]) => mockEventFindFirst(...a),
      create: (...a: any[]) => mockEventCreate(...a),
    },
  },
}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
}));

jest.mock('../../src/modules/repository/repository.service', () => ({
  RepositoryService: jest.fn(),
}));

jest.mock('../../src/modules/repository/services/github.service', () => ({
  GithubService: jest.fn(),
}));

describe('SyncService', () => {
  let service: SyncService;
  let mockGithubService: { [key: string]: jest.Mock };
  let mockRepositoryService: { create: jest.Mock };
  let mockBranchSyncService: { syncBranchesForUser: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockGithubService = {
      getUserRepositories: jest.fn().mockResolvedValue([]),
      getStarredRepos: jest.fn().mockResolvedValue([]),
      getCommits: jest.fn().mockResolvedValue([]),
      getPullRequests: jest.fn().mockResolvedValue([]),
      getIssues: jest.fn().mockResolvedValue([]),
    };
    mockRepositoryService = {
      create: jest.fn().mockResolvedValue({ id: 'new-r1' }),
    };
    mockBranchSyncService = {
      syncBranchesForUser: jest.fn().mockResolvedValue(undefined),
    };
    mockUserRepoUpdateMany.mockResolvedValue({ count: 0 });
    mockGetUserMonitoredRepositoryIds.mockResolvedValue([]);
    service = new SyncService(
      mockGithubService as any,
      mockRepositoryService as any,
      mockBranchSyncService as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── syncUserRepositories ───────────────────────────────────────────────────
  describe('syncUserRepositories', () => {
    it('returns zeros when user has no GitHub token', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: null });
      const result = await service.syncUserRepositories('u1');
      expect(result).toEqual({ synced: 0, starred: 0 });
      expect(mockGithubService.getUserRepositories).not.toHaveBeenCalled();
    });

    it('returns zeros when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const result = await service.syncUserRepositories('u1');
      expect(result).toEqual({ synced: 0, starred: 0 });
    });

    it('creates new repo when not already existing', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([
        { id: 123, full_name: 'org/new-repo' },
      ]);
      mockGithubService.getStarredRepos.mockResolvedValue([]);
      mockRepoFindFirst.mockResolvedValue(null); // not existing

      const result = await service.syncUserRepositories('u1');
      expect(result.synced).toBe(1);
      expect(mockRepositoryService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ platform: 'GITHUB', owner: 'org', repo: 'new-repo' }),
        expect.objectContaining({ userOAuthToken: 'token' }),
      );
    });

    it('links existing repo when user not yet associated', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([
        { id: 456, full_name: 'org/existing' },
      ]);
      mockGithubService.getStarredRepos.mockResolvedValue([]);
      mockRepoFindFirst.mockResolvedValue({ id: 'r-existing' }); // already exists
      mockUserRepoFindUnique.mockResolvedValue(null); // not linked

      await service.syncUserRepositories('u1');
      expect(mockUserRepoCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', role: 'VIEWER' }) }),
      );
      expect(mockRepositoryService.create).not.toHaveBeenCalled();
    });

    it('skips linking when user already associated to repo', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([
        { id: 789, full_name: 'org/already-linked' },
      ]);
      mockGithubService.getStarredRepos.mockResolvedValue([]);
      mockRepoFindFirst.mockResolvedValue({ id: 'r-linked' });
      mockUserRepoFindUnique.mockResolvedValue({ userId: 'u1', repositoryId: 'r-linked' });

      const result = await service.syncUserRepositories('u1');
      expect(mockUserRepoCreate).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
    });

    it('creates starred repo when not existing', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockResolvedValue([
        { id: 999, full_name: 'org/starred-repo' },
      ]);
      mockRepoFindFirst.mockResolvedValue(null);

      const result = await service.syncUserRepositories('u1');
      expect(result.starred).toBe(1);
      expect(mockRepositoryService.create).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ platform: 'GITHUB', owner: 'org', repo: 'starred-repo' }),
        expect.objectContaining({ isStarred: true, accessMode: 'MONITOR', accessLevel: 'READ' }),
      );
    });

    it('marks linked existing starred repo as starred', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockResolvedValue([
        { id: 999, full_name: 'org/starred-repo' },
      ]);
      mockRepoFindFirst.mockResolvedValue({ id: 'r-starred' });
      mockUserRepoFindUnique.mockResolvedValue(null);

      await service.syncUserRepositories('u1');

      expect(mockUserRepoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            repositoryId: 'r-starred',
            isStarred: true,
            accessMode: 'MONITOR',
            accessLevel: 'READ',
          }),
        }),
      );
    });

    it('marks existing editable starred repo without downgrading permissions', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockResolvedValue([
        { id: 999, full_name: 'org/starred-repo' },
      ]);
      mockRepoFindFirst.mockResolvedValue({ id: 'r-starred' });
      mockUserRepoFindUnique.mockResolvedValue({
        userId: 'u1',
        repositoryId: 'r-starred',
        accessMode: 'EDITABLE',
        accessLevel: 'WRITE',
        role: 'MEMBER',
      });

      await service.syncUserRepositories('u1');

      expect(mockUserRepoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isStarred: true },
        }),
      );
    });

    it('clears isStarred for repos no longer returned by GitHub starred API', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockResolvedValue([
        { id: 999, full_name: 'org/still-starred' },
      ]);
      mockRepoFindFirst.mockResolvedValue({ id: 'r-still-starred' });
      mockUserRepoFindUnique.mockResolvedValue({ accessMode: 'MONITOR' });

      await service.syncUserRepositories('u1');

      expect(mockUserRepoUpdateMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          isStarred: true,
          repository: {
            platform: 'GITHUB',
            externalId: { notIn: ['999'] },
          },
        },
        data: { isStarred: false },
      });
    });

    it('does not clear isStarred when starred fetch fails', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockRejectedValue(new Error('GitHub unavailable'));

      await service.syncUserRepositories('u1');

      expect(mockUserRepoUpdateMany).not.toHaveBeenCalled();
    });

    it('schedules history sync only for monitored starred repositories', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r-starred']);
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockResolvedValue([
        { id: 999, full_name: 'org/starred-repo' },
      ]);
      mockRepoFindFirst.mockResolvedValue({ id: 'r-starred' });
      mockUserRepoFindUnique.mockResolvedValue({ accessMode: 'MONITOR' });
      const historySpy = jest
        .spyOn(service, 'syncAllUserRepositoriesHistory')
        .mockResolvedValue(undefined);

      await service.syncUserRepositories('u1');
      jest.runOnlyPendingTimers();

      expect(historySpy).toHaveBeenCalledWith('u1', ['r-starred']);
    });

    it('does not sync starred repository history when monitoring scope is empty', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockResolvedValue([
        { id: 999, full_name: 'org/starred-repo' },
      ]);
      mockRepoFindFirst.mockResolvedValue({ id: 'r-starred' });
      mockUserRepoFindUnique.mockResolvedValue({ accessMode: 'MONITOR' });
      const historySpy = jest
        .spyOn(service, 'syncAllUserRepositoriesHistory')
        .mockResolvedValue(undefined);

      await service.syncUserRepositories('u1');
      jest.runOnlyPendingTimers();

      expect(historySpy).not.toHaveBeenCalled();
    });

    it('triggers branch sync after repository sync', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubRefreshToken: null });
      mockGithubService.getUserRepositories.mockResolvedValue([]);
      mockGithubService.getStarredRepos.mockResolvedValue([]);

      await service.syncUserRepositories('u1');
      jest.runOnlyPendingTimers();

      expect(mockBranchSyncService.syncBranchesForUser).toHaveBeenCalledWith('u1');
    });

    it('handles errors per individual repo without stopping sync', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token' });
      mockGithubService.getUserRepositories.mockResolvedValue([
        { id: 1, full_name: 'org/bad' },
        { id: 2, full_name: 'org/good' },
      ]);
      mockGithubService.getStarredRepos.mockResolvedValue([]);
      mockRepoFindFirst
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(null);

      const result = await service.syncUserRepositories('u1');
      // One failed, one succeeded (created)
      expect(result.synced).toBe(1);
    });

    it('returns zeros on top-level error', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token' });
      mockGithubService.getUserRepositories.mockRejectedValue(new Error('API down'));

      const result = await service.syncUserRepositories('u1');
      expect(result).toEqual({ synced: 0, starred: 0 });
    });

    it('rethrows fetch errors when throwOnFetchError is set (token-save endpoint needs the real failure)', async () => {
      mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token' });
      mockGithubService.getUserRepositories.mockRejectedValue(new Error('API down'));

      await expect(service.syncUserRepositories('u1', { throwOnFetchError: true })).rejects.toThrow('API down');
      expect(mockGithubService.getUserRepositories).toHaveBeenCalledWith(
        'token',
        undefined,
        { throwOnError: true },
      );
    });
  });

  // ── syncRepositoryHistory ──────────────────────────────────────────────────
  describe('syncRepositoryHistory', () => {
    const makeRepo = (overrides = {}) => ({
      id: 'r1',
      fullName: 'org/repo',
      defaultBranch: 'main',
      users: [{ user: { githubAccessToken: 'token' } }],
      ...overrides,
    });

    it('throws when repo not found', async () => {
      mockRepoFindMany.mockResolvedValue(null);
      await expect(service.syncRepositoryHistory('r99')).rejects.toThrow('Repository r99 not found');
    });

    it('throws when no GitHub token', async () => {
      mockRepoFindMany.mockResolvedValue({ ...makeRepo(), users: [{ user: { githubAccessToken: null } }] });
      await expect(service.syncRepositoryHistory('r1')).rejects.toThrow('No GitHub token');
    });

    it('creates commit events for new commits', async () => {
      mockRepoFindMany.mockResolvedValue(makeRepo());
      mockGithubService.getCommits.mockResolvedValue([
        { sha: 'abc123', commit: { message: 'fix bug', author: { name: 'Alice', date: '2024-01-01T00:00:00Z' } } },
      ]);
      mockGithubService.getPullRequests.mockResolvedValue([]);
      mockGithubService.getIssues.mockResolvedValue([]);
      mockEventFindFirst.mockResolvedValue(null); // not existing
      mockEventCreate.mockResolvedValue({});
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.syncRepositoryHistory('r1');
      expect(result.commits).toBe(1);
      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'PUSH', externalId: 'abc123' }) }),
      );
    });

    it('skips existing commit events', async () => {
      mockRepoFindMany.mockResolvedValue(makeRepo());
      mockGithubService.getCommits.mockResolvedValue([
        { sha: 'existing-sha', commit: { message: 'old', author: { name: 'A', date: '2024-01-01T00:00:00Z' } } },
      ]);
      mockGithubService.getPullRequests.mockResolvedValue([]);
      mockGithubService.getIssues.mockResolvedValue([]);
      mockEventFindFirst.mockResolvedValue({ id: 'existing-event' });
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.syncRepositoryHistory('r1');
      expect(result.commits).toBe(0);
      expect(mockEventCreate).not.toHaveBeenCalled();
    });

    it('creates PR_MERGED event for merged PRs', async () => {
      mockRepoFindMany.mockResolvedValue(makeRepo());
      mockGithubService.getCommits.mockResolvedValue([]);
      mockGithubService.getPullRequests.mockResolvedValue([
        { id: 101, title: 'Merge PR', body: 'desc', merged_at: '2024-01-01T00:00:00Z', state: 'closed', user: { login: 'alice' }, head: { ref: 'feat' }, base: { ref: 'main' } },
      ]);
      mockGithubService.getIssues.mockResolvedValue([]);
      mockEventFindFirst.mockResolvedValue(null);
      mockEventCreate.mockResolvedValue({});
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.syncRepositoryHistory('r1');
      expect(result.prs).toBe(1);
      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'PR_MERGED', externalId: '101' }) }),
      );
    });

    it('creates PR_CLOSED event for closed non-merged PRs', async () => {
      mockRepoFindMany.mockResolvedValue(makeRepo());
      mockGithubService.getCommits.mockResolvedValue([]);
      mockGithubService.getPullRequests.mockResolvedValue([
        { id: 102, title: 'Close PR', body: null, merged_at: null, state: 'closed', user: { login: 'bob' }, head: { ref: 'feat' }, base: { ref: 'main' }, closed_at: '2024-01-02T00:00:00Z', created_at: '2024-01-01T00:00:00Z' },
      ]);
      mockGithubService.getIssues.mockResolvedValue([]);
      mockEventFindFirst.mockResolvedValue(null);
      mockEventCreate.mockResolvedValue({});
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.syncRepositoryHistory('r1');
      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'PR_CLOSED' }) }),
      );
    });

    it('creates ISSUE_OPENED and ISSUE_CLOSED events', async () => {
      mockRepoFindMany.mockResolvedValue(makeRepo());
      mockGithubService.getCommits.mockResolvedValue([]);
      mockGithubService.getPullRequests.mockResolvedValue([]);
      mockGithubService.getIssues.mockResolvedValue([
        { id: 201, title: 'Open issue', body: 'desc', state: 'open', user: { login: 'carol' }, created_at: '2024-01-01T00:00:00Z' },
        { id: 202, title: 'Closed issue', body: null, state: 'closed', user: { login: 'dave' }, closed_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z', created_at: '2024-01-01T00:00:00Z' },
      ]);
      mockEventFindFirst.mockResolvedValue(null);
      mockEventCreate.mockResolvedValue({});
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.syncRepositoryHistory('r1');
      expect(result.issues).toBe(2);
    });

    it('skips issues that are PRs (have pull_request field)', async () => {
      mockRepoFindMany.mockResolvedValue(makeRepo());
      mockGithubService.getCommits.mockResolvedValue([]);
      mockGithubService.getPullRequests.mockResolvedValue([]);
      mockGithubService.getIssues.mockResolvedValue([
        { id: 301, title: 'PR as issue', state: 'open', pull_request: { url: 'url' }, user: { login: 'eve' }, created_at: '2024-01-01T00:00:00Z' },
      ]);
      mockEventFindFirst.mockResolvedValue(null);
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.syncRepositoryHistory('r1');
      expect(result.issues).toBe(0);
    });
  });

  // ── syncAllUserRepositoriesHistory ─────────────────────────────────────────
  describe('syncAllUserRepositoriesHistory', () => {
    it('returns without syncing when monitoring scope is empty', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue([]);

      await service.syncAllUserRepositoriesHistory('u1');

      expect(mockRepoFindMany).not.toHaveBeenCalled();
    });

    it('iterates monitored user repos and calls syncRepositoryHistory for each', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r1', 'r2']);
      mockRepoFindMany.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }]);
      // syncRepositoryHistory will call findMany/findUnique for repo details
      // For simplicity, mock it to throw (handled silently per repo)
      mockRepoFindMany.mockResolvedValue({ fullName: 'o/r', defaultBranch: 'main', users: [{ user: { githubAccessToken: null } }] });

      // Should not throw even if individual repos fail
      await service.syncAllUserRepositoriesHistory('u1');
      // Verify it tried to find repos for user
      expect(mockRepoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['r1', 'r2'] },
            users: { some: { userId: 'u1' } },
          },
        }),
      );
    });

    it('syncs priority repos before the rest of the monitored repos', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['r1', 'r2']);
      mockRepoFindMany
        .mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }])
        .mockResolvedValue({ fullName: 'o/r', defaultBranch: 'main', users: [{ user: { githubAccessToken: null } }] });

      const historySpy = jest.spyOn(service, 'syncRepositoryHistory');

      await service.syncAllUserRepositoriesHistory('u1', ['r2']);

      expect(historySpy.mock.calls.map((call) => call[0])).toEqual(['r2', 'r1']);
    });
  });
});
