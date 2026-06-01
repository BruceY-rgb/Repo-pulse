import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@repo-pulse/database';
import { EventService } from '../src/modules/event/event.service';
import { RepositoryService } from '../src/modules/repository/repository.service';
import { GithubService } from '../src/modules/repository/services/github.service';
import { GitlabService } from '../src/modules/repository/services/gitlab.service';

describe('RepositoryService.getBranches', () => {
  let service: RepositoryService;
  let githubServiceMock: { getBranches: jest.Mock };
  let gitlabServiceMock: { getBranches: jest.Mock };
  let prismaMock: {
    repository: { findUnique: jest.Mock };
    event: { findMany: jest.Mock };
  };

  beforeEach(() => {
    githubServiceMock = {
      getBranches: jest.fn(),
    };
    gitlabServiceMock = {
      getBranches: jest.fn(),
    };

    service = new RepositoryService(
      {} as ConfigService,
      githubServiceMock as unknown as GithubService,
      gitlabServiceMock as unknown as GitlabService,
      {} as EventService,
      {} as never,
    );

    prismaMock = {
      repository: {
        findUnique: jest.fn(),
      },
      event: {
        findMany: jest.fn(),
      },
    };

    (service as unknown as { prisma: typeof prismaMock }).prisma = prismaMock;
  });

  it('returns merged branch details from provider, default branch, and observed events', async () => {
    prismaMock.repository.findUnique.mockResolvedValue({
      id: 'repo-1',
      fullName: 'acme/platform-web',
      defaultBranch: 'main',
      platform: Platform.GITHUB,
      url: 'https://github.com/acme/platform-web',
      users: [
        {
          userId: 'user-1',
          user: {
            githubAccessToken: 'token-123',
          },
        },
      ],
    });
    prismaMock.event.findMany.mockResolvedValue([
      {
        branch: 'feature/auth',
        sourceBranch: 'release/1.0',
        targetBranch: null,
      },
      {
        branch: null,
        sourceBranch: null,
        targetBranch: 'hotfix/login',
      },
    ]);
    githubServiceMock.getBranches.mockResolvedValue([
      {
        name: 'release/1.0',
        isProtected: true,
        lastCommitSha: 'abcdef1234567890',
      },
      {
        name: 'main',
        isProtected: true,
        lastCommitSha: '1234567890abcdef',
      },
    ]);

    await expect(service.getBranches('user-1', 'repo-1')).resolves.toEqual([
      expect.objectContaining({
        name: 'feature/auth',
        isObserved: true,
        isDefault: false,
      }),
      expect.objectContaining({
        name: 'hotfix/login',
        isObserved: true,
        isDefault: false,
      }),
      expect.objectContaining({
        name: 'main',
        isDefault: true,
        isProtected: true,
        lastCommitSha: '1234567890abcdef',
      }),
      expect.objectContaining({
        name: 'release/1.0',
        isObserved: true,
        isProtected: true,
        lastCommitSha: 'abcdef1234567890',
      }),
    ]);
  });

  it('falls back to default and observed branches when the provider lookup fails', async () => {
    prismaMock.repository.findUnique.mockResolvedValue({
      id: 'repo-2',
      fullName: 'acme/platform-api',
      defaultBranch: 'develop',
      platform: Platform.GITHUB,
      url: 'https://github.com/acme/platform-api',
      users: [
        {
          userId: 'user-1',
          user: {
            githubAccessToken: 'token-456',
          },
        },
      ],
    });
    prismaMock.event.findMany.mockResolvedValue([
      {
        branch: 'feature/alerts',
        sourceBranch: null,
        targetBranch: null,
      },
      {
        branch: null,
        sourceBranch: 'develop',
        targetBranch: 'release/2.0',
      },
    ]);
    githubServiceMock.getBranches.mockRejectedValue(new Error('provider unavailable'));

    await expect(service.getBranches('user-1', 'repo-2')).resolves.toEqual([
      expect.objectContaining({
        name: 'develop',
        isDefault: true,
        isObserved: true,
      }),
      expect.objectContaining({
        name: 'feature/alerts',
        isObserved: true,
      }),
      expect.objectContaining({
        name: 'release/2.0',
        isObserved: true,
      }),
    ]);
  });

  it('throws when the repository cannot be found', async () => {
    prismaMock.repository.findUnique.mockResolvedValue(null);

    await expect(service.getBranches('user-1', 'missing-repo')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws when the current user does not have access to the repository', async () => {
    prismaMock.repository.findUnique.mockResolvedValue({
      id: 'repo-3',
      fullName: 'acme/platform-mobile',
      defaultBranch: 'main',
      platform: Platform.GITHUB,
      url: 'https://github.com/acme/platform-mobile',
      users: [
        {
          userId: 'user-2',
          user: {
            githubAccessToken: 'token-789',
          },
        },
      ],
    });

    await expect(service.getBranches('user-1', 'repo-3')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
