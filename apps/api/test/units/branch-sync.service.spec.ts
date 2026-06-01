import { BranchSyncService } from '../../src/modules/sync/branch-sync.service';

const mockUserFindUnique = jest.fn();
const mockUserRepoFindMany = jest.fn();
const mockEventFindFirst = jest.fn();
const mockEventCreate = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  EventType: {
    BRANCH_SYNC_ALERT: 'BRANCH_SYNC_ALERT',
    UPSTREAM_SYNC_ALERT: 'UPSTREAM_SYNC_ALERT',
  },
  RepositoryAccessMode: {
    EDITABLE: 'EDITABLE',
    MONITOR: 'MONITOR',
  },
  NotificationChannel: {
    IN_APP: 'IN_APP',
    EMAIL: 'EMAIL',
  },
  Role: {
    ADMIN: 'ADMIN',
    MANAGER: 'MANAGER',
    MEMBER: 'MEMBER',
    VIEWER: 'VIEWER',
  },
  prisma: {
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    userRepository: { findMany: (...a: any[]) => mockUserRepoFindMany(...a) },
    event: {
      findFirst: (...a: any[]) => mockEventFindFirst(...a),
    },
  },
}));

describe('BranchSyncService', () => {
  let service: BranchSyncService;
  let mockGithubService: any;
  let mockEventService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGithubService = {
      getBranches: jest.fn().mockResolvedValue([]),
      getPullRequests: jest.fn().mockResolvedValue([]),
      compareBranches: jest.fn().mockResolvedValue(null),
      getRepository: jest.fn().mockResolvedValue(null),
    };

    mockEventService = {
      create: mockEventCreate.mockResolvedValue({ id: 'evt-1' }),
    };

    service = new BranchSyncService(mockGithubService, mockEventService);
  });

  it('skips sync if user has no GitHub access token', async () => {
    mockUserFindUnique.mockResolvedValue({ githubAccessToken: null });

    await service.syncBranchesForUser('u1');

    expect(mockUserRepoFindMany).not.toHaveBeenCalled();
  });

  it('detects ahead branch and creates BRANCH_SYNC_ALERT when no PR exists', async () => {
    mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token', githubLogin: 'bob' });
    mockUserRepoFindMany.mockResolvedValue([
      {
        repository: {
          id: 'repo-1',
          fullName: 'bob/my-project',
          defaultBranch: 'main',
        },
      },
    ]);

    mockGithubService.getBranches.mockResolvedValue([
      { name: 'main', lastCommitSha: 'sha-main' },
      { name: 'feat-new', lastCommitSha: 'sha-feat' },
    ]);

    mockGithubService.getPullRequests.mockResolvedValue([]); // No open PRs

    mockGithubService.compareBranches.mockImplementation((owner: string, repo: string, base: string, head: string) => {
      if (base === 'main' && head === 'feat-new') {
        return Promise.resolve({
          ahead_by: 3,
          behind_by: 0,
          commits: [{ sha: 'sha-feat', commit: { message: 'feat: add stuff', author: { name: 'Bob' } } }],
        });
      }
      return Promise.resolve(null);
    });

    mockEventFindFirst.mockResolvedValue(null); // No existing alert

    await service.syncBranchesForUser('u1');

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: 'repo-1',
        type: 'BRANCH_SYNC_ALERT',
        branch: 'feat-new',
        action: 'ahead',
        metadata: expect.objectContaining({
          aheadBy: 3,
          defaultBranch: 'main',
          lastCommitSha: 'sha-feat',
        }),
      }),
    );
  });

  it('skips ahead branch alert if an open PR targeting default branch already exists', async () => {
    mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token' });
    mockUserRepoFindMany.mockResolvedValue([
      {
        repository: {
          id: 'repo-1',
          fullName: 'bob/my-project',
          defaultBranch: 'main',
        },
      },
    ]);

    mockGithubService.getBranches.mockResolvedValue([
      { name: 'main', lastCommitSha: 'sha-main' },
      { name: 'feat-new', lastCommitSha: 'sha-feat' },
    ]);

    mockGithubService.getPullRequests.mockResolvedValue([
      { head: { ref: 'feat-new' }, base: { ref: 'main' } }, // Active PR exists
    ]);

    mockGithubService.compareBranches.mockResolvedValue({
      ahead_by: 3,
      behind_by: 0,
      commits: [{ sha: 'sha-feat' }],
    });

    await service.syncBranchesForUser('u1');

    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it('detects when local default branch is behind upstream and creates UPSTREAM_SYNC_ALERT', async () => {
    mockUserFindUnique.mockResolvedValue({ githubAccessToken: 'token' });
    mockUserRepoFindMany.mockResolvedValue([
      {
        repository: {
          id: 'repo-fork',
          fullName: 'bob/my-fork',
          defaultBranch: 'main',
        },
      },
    ]);

    mockGithubService.getBranches.mockResolvedValue([{ name: 'main', lastCommitSha: 'sha-main' }]);
    mockGithubService.getPullRequests.mockResolvedValue([]);

    // Mock that the repo is a fork
    mockGithubService.getRepository.mockResolvedValue({
      fork: true,
      parent: {
        full_name: 'upstream/original-project',
        default_branch: 'main',
      },
    });

    mockGithubService.compareBranches.mockImplementation((owner: string, repo: string, base: string, head: string) => {
      // Comparing main with upstream:main
      if (base === 'main' && head === 'upstream:main') {
        return Promise.resolve({
          ahead_by: 5, // Upstream is 5 commits ahead of us (we are behind)
          behind_by: 1,
          commits: [{ sha: 'sha-upstream-latest', commit: { message: 'upstream updates', author: { name: 'Alice' } } }],
        });
      }
      return Promise.resolve(null);
    });

    mockEventFindFirst.mockResolvedValue(null);

    await service.syncBranchesForUser('u1');

    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: 'repo-fork',
        type: 'UPSTREAM_SYNC_ALERT',
        branch: 'main',
        action: 'behind',
        metadata: expect.objectContaining({
          behindBy: 5,
          upstreamRepository: 'upstream/original-project',
          upstreamBranch: 'main',
        }),
      }),
    );
  });
});
