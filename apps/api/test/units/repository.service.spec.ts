import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WebhookStatus } from '@repo-pulse/shared';
import { RepositoryService } from '../../src/modules/repository/repository.service';

const mockAssertUserCanAccessRepository = jest.fn();
const mockAssertUserCanEditRepository = jest.fn();
const mockGetUserMonitoredRepositoryIds = jest.fn();

const mockRepoFindUnique = jest.fn();
const mockRepoFindMany = jest.fn();
const mockRepoUpsert = jest.fn();
const mockRepoUpdate = jest.fn();
const mockRepoDelete = jest.fn();
const mockUserRepoUpsert = jest.fn();
const mockUserRepoFindMany = jest.fn();
const mockEventFindMany = jest.fn();
const mockEventUpdate = jest.fn();

jest.mock('../../src/common/utils/repository-access', () => ({
  assertUserCanAccessRepository: (...a: any[]) => mockAssertUserCanAccessRepository(...a),
  assertUserCanEditRepository: (...a: any[]) => mockAssertUserCanEditRepository(...a),
  getUserMonitoredRepositoryIds: (...a: any[]) => mockGetUserMonitoredRepositoryIds(...a),
  getAccessibleRepositoryIds: jest.fn().mockResolvedValue([]),
  getUserRepositoryMembership: jest.fn().mockResolvedValue(null),
  isEditableRepositoryAccessLevel: (level: string) =>
    ['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE'].includes(level),
}));

jest.mock('@repo-pulse/database', () => ({
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
    RELEASE: 'RELEASE',
  },
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  PrismaClient: jest.fn().mockImplementation(() => ({
    repository: {
      findUnique: (...a: any[]) => mockRepoFindUnique(...a),
      findMany: (...a: any[]) => mockRepoFindMany(...a),
      upsert: (...a: any[]) => mockRepoUpsert(...a),
      update: (...a: any[]) => mockRepoUpdate(...a),
      delete: (...a: any[]) => mockRepoDelete(...a),
    },
    userRepository: {
      upsert: (...a: any[]) => mockUserRepoUpsert(...a),
      findMany: (...a: any[]) => mockUserRepoFindMany(...a),
    },
    event: {
      findMany: (...a: any[]) => mockEventFindMany(...a),
      update: (...a: any[]) => mockEventUpdate(...a),
    },
  })),
}));

jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => {},
}));

jest.mock('../../src/modules/event/event.service', () => ({
  EventService: jest.fn(),
}));

function makeRepo(overrides: object = {}) {
  return {
    id: 'r1',
    name: 'repo',
    fullName: 'org/repo',
    platform: 'GITHUB',
    externalId: 'ext-1',
    url: 'https://github.com/org/repo',
    defaultBranch: 'main',
    webhookId: null,
    webhookSecret: 'secret',
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    users: [],
    events: [],
    ...overrides,
  };
}

const defaultMembership = { accessLevel: 'WRITE', accessMode: 'EDITABLE', role: 'ADMIN' };

describe('RepositoryService', () => {
  let service: RepositoryService;
  let mockConfigService: { get: jest.Mock };
  let mockGithubService: { [key: string]: jest.Mock };
  let mockGitlabService: { [key: string]: jest.Mock };
  let mockEventService: { findByExternalId: jest.Mock; create: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertUserCanAccessRepository.mockResolvedValue(defaultMembership);
    mockAssertUserCanEditRepository.mockResolvedValue(defaultMembership);
    mockGetUserMonitoredRepositoryIds.mockResolvedValue([]);
    mockRepoFindMany.mockResolvedValue([]);

    mockConfigService = { get: jest.fn().mockReturnValue('http://localhost:3001') };
    mockGithubService = {
      getRepository: jest.fn(),
      createWebhook: jest.fn().mockResolvedValue('wh-1'),
      deleteWebhook: jest.fn().mockResolvedValue(undefined),
      getBranches: jest.fn().mockResolvedValue([]),
      getCommits: jest.fn().mockResolvedValue([]),
      getPullRequests: jest.fn().mockResolvedValue([]),
      getIssues: jest.fn().mockResolvedValue([]),
      getReleases: jest.fn().mockResolvedValue([]),
      searchRepositories: jest.fn().mockResolvedValue([]),
      getUserRepositories: jest.fn().mockResolvedValue([]),
      getStarredRepos: jest.fn().mockResolvedValue([]),
      getWebhook: jest.fn().mockResolvedValue({ active: true, last_response: null }),
    };
    mockGitlabService = {
      getRepository: jest.fn(),
      createWebhook: jest.fn().mockResolvedValue(undefined),
      deleteWebhook: jest.fn().mockResolvedValue(undefined),
      getBranches: jest.fn().mockResolvedValue([]),
      getCommits: jest.fn().mockResolvedValue([]),
      getMergeRequests: jest.fn().mockResolvedValue([]),
      getIssues: jest.fn().mockResolvedValue([]),
      getReleases: jest.fn().mockResolvedValue([]),
    };
    mockEventService = {
      findByExternalId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };
    service = new RepositoryService(
      mockConfigService as any,
      mockGithubService as any,
      mockGitlabService as any,
      mockEventService as any,
    );
  });

  describe('getWebhookStatus', () => {
    it('returns FAILED when GitHub hook exists but the last delivery could not connect', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        webhookId: 'wh-1',
        users: [
          {
            userId: 'u1',
            accessMode: 'EDITABLE',
            user: { id: 'u1', githubAccessToken: 'token' },
          },
        ],
      }));
      mockGithubService.getWebhook.mockResolvedValueOnce({
        active: true,
        last_response: {
          code: null,
          status: 'failed to connect to host',
          message: 'failed to connect to host',
        },
      });

      const result = await service.getWebhookStatus('u1', 'r1');

      expect(result.status).toBe(WebhookStatus.FAILED);
      expect(result.lastError).toBe('failed to connect to host');
      expect(result.active).toBe(true);
    });

    it('returns ACTIVE when GitHub hook exists and last delivery was successful', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        webhookId: 'wh-1',
        users: [
          {
            userId: 'u1',
            accessMode: 'EDITABLE',
            user: { id: 'u1', githubAccessToken: 'token' },
          },
        ],
      }));
      mockGithubService.getWebhook.mockResolvedValueOnce({
        active: true,
        last_response: {
          code: 200,
          status: 'OK',
          message: null,
        },
      });

      const result = await service.getWebhookStatus('u1', 'r1');

      expect(result.status).toBe(WebhookStatus.ACTIVE);
      expect(result.lastError).toBeNull();
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('throws NotFoundException when repo not found', async () => {
      mockRepoFindUnique.mockResolvedValue(null);
      await expect(service.findById('u1', 'r99')).rejects.toThrow(NotFoundException);
    });

    it('returns repository when found', async () => {
      const repo = makeRepo();
      mockRepoFindUnique.mockResolvedValue(repo);
      const result = await service.findById('u1', 'r1');
      expect(result).toMatchObject({ id: repo.id });
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('finds all repos for user', async () => {
      const repos = [makeRepo()];
      mockRepoFindMany.mockResolvedValue(repos);
      const result = await service.findAll('u1');
      expect(result).toHaveLength(1);
      expect(mockRepoFindMany.mock.calls[0][0].where.users.some.userId).toBe('u1');
    });

    it('includes isActive filter when provided', async () => {
      mockRepoFindMany.mockResolvedValue([]);
      await service.findAll('u1', { isActive: true });
      expect(mockRepoFindMany.mock.calls[0][0].where.isActive).toBe(true);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  it('delegates update to prisma', async () => {
    const updated = makeRepo({ name: 'new-name' });
    mockRepoUpdate.mockResolvedValue(updated);
    const result = await service.update('r1', { name: 'new-name' } as any);
    expect(result).toBe(updated);
    expect(mockRepoUpdate).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { name: 'new-name' } });
  });

  // ── getUserRepositories ────────────────────────────────────────────────────
  it('returns userRepository records', async () => {
    const records = [{ repositoryId: 'r1', repository: makeRepo() }];
    mockUserRepoFindMany.mockResolvedValue(records);
    const result = await service.getUserRepositories('u1');
    expect(result).toBe(records);
  });

  // ── getBranches ────────────────────────────────────────────────────────────
  describe('getBranches', () => {
    it('throws NotFoundException when repo not found', async () => {
      mockRepoFindUnique.mockResolvedValue(null);
      await expect(service.getBranches('u1', 'r99')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user not a member', async () => {
      mockAssertUserCanAccessRepository.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.getBranches('u1', 'r1')).rejects.toThrow(ForbiddenException);
    });

    it('returns merged branches from provider and observed events', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        defaultBranch: 'main',
        platform: 'GITHUB',
        users: [{ userId: 'u1', user: { id: 'u1', githubAccessToken: 'token' } }],
      }));
      mockGithubService.getBranches.mockResolvedValue([
        { name: 'main', isProtected: true, lastCommitSha: 'abc' },
        { name: 'develop', isProtected: false, lastCommitSha: 'def' },
      ]);
      mockEventFindMany.mockResolvedValue([
        { branch: 'feature-x', sourceBranch: 'develop', targetBranch: 'main', branches: [] },
      ]);

      const result = await service.getBranches('u1', 'r1');
      const names = result.map((b: any) => b.name);
      expect(names).toContain('main');
      expect(names).toContain('develop');
      expect(names).toContain('feature-x');
      expect(result.find((b: any) => b.name === 'main')?.isDefault).toBe(true);
      expect(result.find((b: any) => b.name === 'feature-x')?.isObserved).toBe(true);
    });

    it('falls back to observed branches when provider call fails', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        platform: 'GITHUB',
        users: [{ userId: 'u1', user: { id: 'u1', githubAccessToken: 'token' } }],
      }));
      mockGithubService.getBranches.mockRejectedValue(new Error('API error'));
      mockEventFindMany.mockResolvedValue([
        { branch: 'hotfix', sourceBranch: null, targetBranch: null, branches: [] },
      ]);

      const result = await service.getBranches('u1', 'r1');
      expect(result.some((b: any) => b.name === 'hotfix')).toBe(true);
    });

    it('handles GitLab repos using gitlab service', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        platform: 'GITLAB',
        users: [{ userId: 'u1', user: { id: 'u1', githubAccessToken: null } }],
      }));
      mockGitlabService.getBranches.mockResolvedValue([
        { name: 'main', isProtected: false, lastCommitSha: 'gl-sha' },
      ]);
      mockEventFindMany.mockResolvedValue([]);

      await service.getBranches('u1', 'r1');
      expect(mockGitlabService.getBranches).toHaveBeenCalled();
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('throws NotFoundException when repo not found', async () => {
      mockRepoFindUnique.mockResolvedValue(null);
      await expect(service.delete('u1', 'r99')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user not a member', async () => {
      mockAssertUserCanAccessRepository.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.delete('u1', 'r1')).rejects.toThrow(ForbiddenException);
    });

    it('deletes repo and returns success', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        users: [{ userId: 'u1', user: { githubAccessToken: null } }],
      }));
      mockRepoDelete.mockResolvedValue({});
      const result = await service.delete('u1', 'r1');
      expect(result).toEqual({ success: true });
      expect(mockRepoDelete).toHaveBeenCalled();
    });

    it('cleans up GitHub webhook when webhookId present', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        webhookId: 'wh-123',
        platform: 'GITHUB',
        users: [{ userId: 'u1', user: { githubAccessToken: 'token' } }],
      }));
      mockRepoDelete.mockResolvedValue({});
      await service.delete('u1', 'r1');
      expect(mockGithubService.deleteWebhook).toHaveBeenCalledWith('org', 'repo', 'wh-123', 'token');
    });

    it('continues deletion even when webhook cleanup fails', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        webhookId: 'wh-123',
        platform: 'GITHUB',
        users: [{ userId: 'u1', user: { githubAccessToken: 'token' } }],
      }));
      mockGithubService.deleteWebhook.mockRejectedValue(new Error('webhook API error'));
      mockRepoDelete.mockResolvedValue({});
      const result = await service.delete('u1', 'r1');
      expect(result).toEqual({ success: true });
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates GitHub repo and registers webhook', async () => {
      mockGithubService.getRepository.mockResolvedValue({
        id: 123, name: 'repo', full_name: 'org/repo',
        html_url: 'https://github.com/org/repo', default_branch: 'main',
        permissions: { push: true },
      });
      const repo = makeRepo({ id: 'r-new' });
      mockRepoUpsert.mockResolvedValue(repo);
      mockUserRepoUpsert.mockResolvedValue({});
      mockRepoUpdate.mockResolvedValue(repo);

      const result = await service.create('u1', { platform: 'GITHUB' as any, owner: 'org', repo: 'repo' });
      expect(result).toMatchObject({ id: 'r-new' });
      expect(mockGithubService.createWebhook).toHaveBeenCalled();
    });

    it('creates GitLab repo', async () => {
      mockGitlabService.getRepository.mockResolvedValue({
        id: 456, name: 'glrepo', path_with_namespace: 'org/glrepo',
        web_url: 'https://gitlab.com/org/glrepo', default_branch: 'main',
      });
      const repo = makeRepo({ id: 'r-gl', platform: 'GITLAB' });
      mockRepoUpsert.mockResolvedValue(repo);
      mockUserRepoUpsert.mockResolvedValue({});

      const result = await service.create('u1', { platform: 'GITLAB' as any, owner: 'org', repo: 'glrepo' });
      expect(result).toMatchObject({ id: 'r-gl' });
      expect(mockGitlabService.createWebhook).toHaveBeenCalled();
    });
  });

  // ── sync — token missing ───────────────────────────────────────────────────
  describe('sync', () => {
    it('throws NotFoundException when repo not found', async () => {
      mockRepoFindUnique.mockResolvedValue(null);
      await expect(service.sync('r99')).rejects.toThrow(NotFoundException);
    });

    it('records github_token_missing when no token for GitHub repo', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        platform: 'GITHUB',
        users: [{ user: { githubAccessToken: null } }],
      }));
      const result = await service.sync('r1');
      expect(result.failedSources).toContain('github_token_missing');
    });

    it('syncs GitHub repo and creates events', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        platform: 'GITHUB',
        users: [{ user: { githubAccessToken: 'token' } }],
      }));
      mockGithubService.getBranches.mockResolvedValue([{ name: 'main', isProtected: false }]);
      mockGithubService.getCommits.mockResolvedValue([
        { sha: 'abc123def456', commit: { message: 'fix bug', author: { name: 'Alice', date: '2024-01-01T00:00:00Z' } } },
      ]);
      mockGithubService.getPullRequests.mockResolvedValue([]);
      mockGithubService.getIssues.mockResolvedValue([]);
      mockEventService.findByExternalId.mockResolvedValue(null);
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.sync('r1');
      expect(result.createdCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PUSH', externalId: 'abc123def456' }),
      );
    });

    it('skips duplicate GitHub commits', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        platform: 'GITHUB',
        users: [{ user: { githubAccessToken: 'token' } }],
      }));
      mockGithubService.getBranches.mockResolvedValue([]);
      mockGithubService.getCommits.mockResolvedValue([
        { sha: 'dup-sha', commit: { message: 'msg', author: { name: 'A', date: '2024-01-01T00:00:00Z' } } },
      ]);
      mockGithubService.getPullRequests.mockResolvedValue([]);
      mockGithubService.getIssues.mockResolvedValue([]);
      mockEventService.findByExternalId.mockResolvedValue({ id: 'existing', branches: [] });
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.sync('r1');
      expect(mockEventService.create).not.toHaveBeenCalled();
    });

    it('syncs GitLab repo', async () => {
      mockRepoFindUnique.mockResolvedValue(makeRepo({
        platform: 'GITLAB',
        users: [{ user: { githubAccessToken: null } }],
      }));
      mockGitlabService.getBranches.mockResolvedValue([{ name: 'main' }]);
      mockGitlabService.getCommits.mockResolvedValue([
        { id: 'gl-sha', message: 'fix', author_name: 'Bob', authored_date: '2024-01-01T00:00:00Z' },
      ]);
      mockGitlabService.getMergeRequests.mockResolvedValue([]);
      mockGitlabService.getIssues.mockResolvedValue([]);
      mockEventService.findByExternalId.mockResolvedValue(null);
      mockRepoUpdate.mockResolvedValue({});

      const result = await service.sync('r1');
      expect(result.createdCount).toBe(1);
      expect(mockEventService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PUSH', externalId: 'gl-sha' }),
      );
    });
  });

  // ── searchRepositories ────────────────────────────────────────────────────
  describe('searchRepositories', () => {
    it('maps GitHub search results to response format', async () => {
      mockGithubService.searchRepositories.mockResolvedValue([{
        id: 1, name: 'test', full_name: 'org/test', description: 'desc',
        html_url: 'url', stargazers_count: 10, language: 'TypeScript',
        owner: { login: 'org', avatar_url: 'av' },
      }]);
      const result = await service.searchRepositories('test');
      expect(result[0]).toMatchObject({ id: 1, name: 'test', platform: 'GITHUB', owner: { login: 'org' } });
    });
  });

  // ── searchUserRepositories ────────────────────────────────────────────────
  describe('searchUserRepositories', () => {
    it('returns empty array when no token provided', async () => {
      const result = await service.searchUserRepositories('u1', '');
      expect(result).toEqual([]);
    });

    it('maps user repos to response format', async () => {
      mockGithubService.getUserRepositories.mockResolvedValue([{
        id: 2, name: 'my-repo', full_name: 'me/my-repo', description: null,
        html_url: 'url', stargazers_count: 0, language: null,
        owner: { login: 'me', avatar_url: 'av' },
      }]);
      const result = await service.searchUserRepositories('u1', 'token');
      expect(result[0].fullName).toBe('me/my-repo');
    });

    it('marks user repos monitored by matching local repository externalId', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['local-r2']);
      mockRepoFindMany.mockResolvedValue([{ externalId: '2' }]);
      mockGithubService.getUserRepositories.mockResolvedValue([{
        id: 2, name: 'my-repo', full_name: 'me/my-repo', description: null,
        html_url: 'url', stargazers_count: 0, language: null,
        owner: { login: 'me', avatar_url: 'av' },
      }]);

      const result = await service.searchUserRepositories('u1', 'token');

      expect(result[0].isMonitored).toBe(true);
      expect(mockRepoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['local-r2'] },
            platform: 'GITHUB',
          },
          select: { externalId: true },
        }),
      );
    });
  });

  // ── searchStarredRepositories ─────────────────────────────────────────────
  describe('searchStarredRepositories', () => {
    it('returns empty array when no token provided', async () => {
      const result = await service.searchStarredRepositories('u1', '');
      expect(result).toEqual([]);
    });

    it('marks starred repos monitored by matching local repository externalId', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue(['local-r3']);
      mockRepoFindMany.mockResolvedValue([{ externalId: '3' }]);
      mockGithubService.getStarredRepos.mockResolvedValue([{
        id: 3, name: 'starred', full_name: 'org/starred', description: null,
        html_url: 'url', stargazers_count: 4, language: 'TypeScript',
        owner: { login: 'org', avatar_url: 'av' },
      }]);

      const result = await service.searchStarredRepositories('u1', 'token');

      expect(result[0].isMonitored).toBe(true);
    });
  });
});
