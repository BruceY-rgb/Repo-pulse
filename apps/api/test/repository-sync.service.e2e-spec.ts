import { ConfigService } from '@nestjs/config';
import { EventType, Platform } from '@repo-pulse/database';
import { EventService } from '../src/modules/event/event.service';
import { RepositoryService } from '../src/modules/repository/repository.service';
import { GithubService } from '../src/modules/repository/services/github.service';
import { GitlabService } from '../src/modules/repository/services/gitlab.service';

describe('RepositoryService.sync', () => {
  let service: RepositoryService;
  let githubServiceMock: {
    getBranches: jest.Mock;
    getCommits: jest.Mock;
    getPullRequests: jest.Mock;
    getIssues: jest.Mock;
  };
  let prismaMock: {
    repository: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let eventServiceMock: {
    findByExternalId: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(() => {
    githubServiceMock = {
      getBranches: jest.fn(),
      getCommits: jest.fn(),
      getPullRequests: jest.fn(),
      getIssues: jest.fn(),
    };

    eventServiceMock = {
      findByExternalId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    service = new RepositoryService(
      {} as ConfigService,
      githubServiceMock as unknown as GithubService,
      {} as GitlabService,
      eventServiceMock as unknown as EventService,
    );

    prismaMock = {
      repository: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    (service as unknown as { prisma: typeof prismaMock }).prisma = prismaMock;
  });

  it('syncs GitHub commits and pull requests per branch with occurredAt timestamps', async () => {
    prismaMock.repository.findUnique.mockResolvedValue({
      id: 'repo-1',
      fullName: 'acme/platform-web',
      defaultBranch: 'main',
      platform: Platform.GITHUB,
      lastSyncAt: null,
      users: [
        {
          user: {
            githubAccessToken: 'token-123',
            githubRefreshToken: null,
          },
        },
      ],
    });
    prismaMock.repository.update.mockResolvedValue(undefined);
    githubServiceMock.getBranches.mockResolvedValue([
      { name: 'main', isProtected: true, lastCommitSha: 'main-sha' },
      { name: 'feature/login', isProtected: false, lastCommitSha: 'feature-sha' },
    ]);
    githubServiceMock.getCommits.mockImplementation(async (
      _owner: string,
      _repo: string,
      options?: { branch?: string },
    ) => {
      if (options?.branch === 'main') {
        return [
          {
            sha: 'main-sha',
            html_url: 'https://github.com/acme/platform-web/commit/main',
            commit: {
              message: 'Main commit',
              author: { name: 'Main Bot', date: '2026-04-21T10:00:00.000Z' },
            },
            author: { login: 'main-bot', avatar_url: 'https://avatar/main.png' },
          },
        ];
      }

      if (options?.branch === 'feature/login') {
        return [
          {
            sha: 'feature-sha',
            html_url: 'https://github.com/acme/platform-web/commit/feature',
            commit: {
              message: 'Feature commit',
              author: { name: 'Feature Bot', date: '2026-04-22T11:00:00.000Z' },
            },
            author: { login: 'feature-bot', avatar_url: 'https://avatar/feature.png' },
          },
        ];
      }

      return [];
    });
    githubServiceMock.getPullRequests.mockImplementation(async (
      _owner: string,
      _repo: string,
      options?: { base?: string },
    ) => (
      options?.base === 'main'
        ? [
            {
              id: 101,
              title: 'Login PR',
              body: 'Adds login flow',
              html_url: 'https://github.com/acme/platform-web/pull/101',
              state: 'open',
              updated_at: '2026-04-23T12:00:00.000Z',
              created_at: '2026-04-23T12:00:00.000Z',
              head: { ref: 'feature/login' },
              base: { ref: 'main' },
              user: { login: 'octocat', avatar_url: 'https://avatar/octocat.png' },
              number: 101,
            },
          ]
        : []
    ));
    githubServiceMock.getIssues.mockResolvedValue([
      {
        id: 202,
        title: 'General issue',
        body: 'Investigate auth',
        html_url: 'https://github.com/acme/platform-web/issues/202',
        state: 'open',
        updated_at: '2026-04-24T13:00:00.000Z',
        created_at: '2026-04-24T13:00:00.000Z',
        user: { login: 'issue-bot', avatar_url: 'https://avatar/issue.png' },
        number: 202,
      },
    ]);
    eventServiceMock.findByExternalId.mockResolvedValue(null);
    eventServiceMock.create.mockResolvedValue(undefined);

    const summary = await service.sync('repo-1', { daysBack: 30 });

    expect(summary.createdCount).toBe(4);
    expect(summary.failedSources).toEqual([]);
    expect(githubServiceMock.getPullRequests).toHaveBeenNthCalledWith(
      1,
      'acme',
      'platform-web',
      { state: 'all', base: 'main' },
      'token-123',
    );
    expect(githubServiceMock.getPullRequests).toHaveBeenNthCalledWith(
      2,
      'acme',
      'platform-web',
      { state: 'all', base: 'feature/login' },
      'token-123',
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'feature-sha',
        type: EventType.PUSH,
        branch: 'feature/login',
        sourceBranch: undefined,
        targetBranch: undefined,
        occurredAt: new Date('2026-04-22T11:00:00.000Z'),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'gh-pr-101',
        type: EventType.PR_OPENED,
        branch: 'main',
        sourceBranch: 'feature/login',
        targetBranch: 'main',
        occurredAt: new Date('2026-04-23T12:00:00.000Z'),
      }),
    );
  });

  it('refreshes mismatched repository_sync events instead of skipping them forever', async () => {
    prismaMock.repository.findUnique.mockResolvedValue({
      id: 'repo-2',
      fullName: 'acme/platform-api',
      defaultBranch: 'main',
      platform: Platform.GITHUB,
      lastSyncAt: null,
      users: [
        {
          user: {
            githubAccessToken: 'token-456',
            githubRefreshToken: null,
          },
        },
      ],
    });
    prismaMock.repository.update.mockResolvedValue(undefined);
    githubServiceMock.getBranches.mockResolvedValue([
      { name: 'feature/login', isProtected: false, lastCommitSha: 'feature-sha' },
    ]);
    githubServiceMock.getCommits.mockResolvedValue([
      {
        sha: 'feature-sha',
        html_url: 'https://github.com/acme/platform-api/commit/feature',
        commit: {
          message: 'Feature commit',
          author: { name: 'Feature Bot', date: '2026-04-22T11:00:00.000Z' },
        },
        author: { login: 'feature-bot', avatar_url: 'https://avatar/feature.png' },
      },
    ]);
    githubServiceMock.getPullRequests.mockResolvedValue([]);
    githubServiceMock.getIssues.mockResolvedValue([]);
    eventServiceMock.findByExternalId.mockResolvedValue({
      id: 'event-1',
      repositoryId: 'repo-2',
      type: EventType.PUSH,
      action: 'sync',
      title: 'Old sync event',
      body: 'outdated',
      author: 'feature-bot',
      authorAvatar: null,
      externalId: 'feature-sha',
      externalUrl: null,
      branch: 'main',
      sourceBranch: null,
      targetBranch: null,
      occurredAt: null,
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        branch: 'main',
      },
      rawPayload: null,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
    });

    const summary = await service.sync('repo-2', { daysBack: 30 });

    expect(summary.createdCount).toBe(0);
    expect(summary.skippedCount).toBe(1);
    expect(eventServiceMock.update).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        branch: 'feature/login',
        occurredAt: new Date('2026-04-22T11:00:00.000Z'),
        metadata: {
          source: 'repository_sync',
          provider: 'github',
          branch: 'feature/login',
        },
      }),
    );
  });
});
