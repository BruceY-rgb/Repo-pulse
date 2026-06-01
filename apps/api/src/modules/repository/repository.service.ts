import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  EventType,
  Platform,
  PrismaClient,
  Repository,
  RepositoryAccessLevel,
  RepositoryAccessMode,
  Role,
} from '@repo-pulse/database';
import { WebhookStatus } from '@repo-pulse/shared';
import { randomBytes } from 'crypto';
import {
  assertUserCanAccessRepository,
  assertUserCanEditRepository,
  getUserMonitoredRepositoryIds,
  isEditableRepositoryAccessLevel,
} from '../../common/utils/repository-access';
import { EventService } from '../event/event.service';
import { EventGateway } from '../event/event.gateway';
import { CreateRepositoryDto, UpdateRepositoryDto } from './dto/repository.dto';
import { GithubBranchInfo, GithubRepoResponse, GithubService } from './services/github.service';
import { GitlabBranchInfo, GitlabService } from './services/gitlab.service';
import type { RepositorySyncStage } from '@repo-pulse/shared';
import { AppConfigService } from '../app-config/app-config.service';

const API_URL_FALLBACK = 'http://localhost:3001';

interface SyncSummary {
  repositoryId: string;
  createdCount: number;
  skippedCount: number;
  updatedCount: number;
  failedSources: string[];
  lastSyncAt: string;
}

export interface WebhookProvisionResult {
  webhookStatus: WebhookStatus;
  webhookError?: string;
  webhookId?: string | null;
}

const STAGE_PROGRESS: Record<Exclude<RepositorySyncStage, 'done'>, number> = {
  commits: 5,
  prs: 40,
  issues: 70,
};

export interface RepositoryBranchOption {
  name: string;
  isDefault: boolean;
  isObserved: boolean;
  isProtected?: boolean;
  lastCommitSha?: string;
}

interface NormalizedSyncEvent {
  type: EventType;
  action: string;
  title: string;
  body?: string;
  author: string;
  authorAvatar?: string;
  externalId: string;
  externalUrl?: string;
  branch?: string;
  sourceBranch?: string;
  targetBranch?: string;
  branches?: string[];
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

type RepositoryAccessLevelApi =
  | 'owner'
  | 'admin'
  | 'maintain'
  | 'write'
  | 'triage'
  | 'read'
  | 'none';

type RepositoryMembershipView = {
  role?: Role | string;
  accessMode?: RepositoryAccessMode | null;
  accessLevel?: RepositoryAccessLevel | null;
};

@Injectable()
export class RepositoryService {
  private readonly logger = new Logger(RepositoryService.name);
  private prisma: PrismaClient;
  private readonly contributorsCache = new Map<string, { data: any[]; expiry: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly githubService: GithubService,
    private readonly gitlabService: GitlabService,
    private readonly eventService: EventService,
    private readonly eventGateway: EventGateway,
    private readonly appConfigService: AppConfigService,
  ) {
    this.prisma = new PrismaClient();
  }

  async create(
    userId: string,
    dto: CreateRepositoryDto,
    options?: {
      userOAuthToken?: string;
      accessMode?: RepositoryAccessMode;
      accessLevel?: RepositoryAccessLevel;
      role?: Role;
      githubLogin?: string;
      isStarred?: boolean;
    },
  ) {
    const { platform, owner, repo } = dto;

    let repoInfo: {
      externalId: string;
      name: string;
      fullName: string;
      url: string;
      defaultBranch: string;
    };
    let accessLevel = options?.accessLevel ?? RepositoryAccessLevel.WRITE;

    if (platform === Platform.GITHUB) {
      const githubRepo = await this.githubService.getRepository(
        owner,
        repo,
        options?.userOAuthToken,
      );
      repoInfo = {
        externalId: String(githubRepo.id),
        name: githubRepo.name,
        fullName: githubRepo.full_name,
        url: githubRepo.html_url,
        defaultBranch: githubRepo.default_branch || 'main',
      };
      accessLevel =
        options?.accessLevel ??
        this.resolveGithubAccessLevel(githubRepo, options?.githubLogin);
    } else {
      const gitlabRepo = await this.gitlabService.getRepository(owner, repo);
      repoInfo = {
        externalId: String(gitlabRepo.id),
        name: gitlabRepo.name,
        fullName: gitlabRepo.path_with_namespace,
        url: gitlabRepo.web_url,
        defaultBranch: gitlabRepo.default_branch || 'main',
      };
      accessLevel = options?.accessLevel ?? RepositoryAccessLevel.WRITE;
    }

    const accessMode =
      options?.accessMode ?? this.resolveAccessModeFromLevel(accessLevel);
    const shouldRegisterWebhook = accessMode === RepositoryAccessMode.EDITABLE;
    const webhookSecret = shouldRegisterWebhook ? this.generateWebhookSecret() : null;
    const role =
      options?.role ??
      (isEditableRepositoryAccessLevel(accessLevel) ? 'ADMIN' : 'VIEWER');

    const repository = await this.prisma.repository.upsert({
      where: {
        platform_externalId: {
          platform,
          externalId: repoInfo.externalId,
        },
      },
      update: {
        isActive: true,
        ...(shouldRegisterWebhook ? { webhookSecret } : {}),
      },
      create: {
        name: repoInfo.name,
        fullName: repoInfo.fullName,
        platform,
        externalId: repoInfo.externalId,
        url: repoInfo.url,
        defaultBranch: repoInfo.defaultBranch,
        webhookSecret,
      },
    });

    await this.prisma.userRepository.upsert({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
      update: {
        accessMode,
        accessLevel,
        role,
        ...(options?.isStarred !== undefined ? { isStarred: options.isStarred } : {}),
      },
      create: {
        userId,
        repositoryId: repository.id,
        role,
        accessMode,
        accessLevel,
        isStarred: options?.isStarred ?? false,
      },
    });

    if (options?.isStarred && platform === Platform.GITHUB && options?.userOAuthToken) {
      try {
        await this.githubService.starRepository(owner, repo, options.userOAuthToken);
      } catch (error) {
        this.logger.error(`Failed to star repository ${repoInfo.fullName} on GitHub`, error);
      }
    }

    let webhookResult: WebhookProvisionResult = {
      webhookStatus: shouldRegisterWebhook
        ? WebhookStatus.NOT_CONFIGURED
        : WebhookStatus.NOT_CONFIGURED,
      webhookError: shouldRegisterWebhook ? 'Webhook has not been provisioned yet' : undefined,
      webhookId: repository.webhookId,
    };

    if (shouldRegisterWebhook) {
      const editableWebhookSecret = webhookSecret ?? this.generateWebhookSecret();
      webhookResult = await this.provisionWebhook({
        repositoryId: repository.id,
        platform,
        owner,
        repo,
        fullName: repoInfo.fullName,
        webhookSecret: editableWebhookSecret,
        userOAuthToken: options?.userOAuthToken,
      });
    } else {
      await this.prisma.repository.update({
        where: { id: repository.id },
        data: {
          webhookStatus: WebhookStatus.NOT_CONFIGURED,
          webhookError: null,
        },
      });
    }

    this.logger.log(
      `Repository ${repoInfo.fullName} added successfully for user ${userId} with accessLevel=${accessLevel}`,
    );
    return this.attachRepositoryAccessView(
      {
        ...repository,
        webhookId: webhookResult.webhookId ?? repository.webhookId,
        webhookStatus: webhookResult.webhookStatus,
        webhookError: webhookResult.webhookError ?? null,
      },
      {
        role,
        accessMode,
        accessLevel,
      },
    );
  }

  async findAll(userId: string, options?: { isActive?: boolean }) {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    const where: Record<string, unknown> = {};

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        users: {
          some: { userId },
        },
        ...where,
      },
      include: {
        users: {
          where: { userId },
          select: {
            userId: true,
            role: true,
            accessMode: true,
            accessLevel: true,
          },
        },
        _count: {
          select: { events: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const monitoredSet = new Set(monitoredRepositoryIds);
    return repositories.map(({ users, ...repository }) =>
      this.attachRepositoryAccessView(repository, users[0], monitoredSet.has(repository.id)),
    );
  }

  async findById(userId: string, id: string): Promise<Repository & Record<string, unknown>> {
    const [membership, monitoredRepositoryIds] = await Promise.all([
      assertUserCanAccessRepository(userId, id),
      getUserMonitoredRepositoryIds(userId),
    ]);
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        events: {
          take: 10,
          orderBy: { occurredAt: 'desc' },
        },
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    return this.attachRepositoryAccessView(
      repository as Repository & Record<string, unknown>,
      membership,
      monitoredRepositoryIds.includes(id),
    );
  }

  async getBranches(userId: string, id: string): Promise<RepositoryBranchOption[]> {
    await assertUserCanAccessRepository(userId, id);

    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                githubAccessToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    const tokenOwner = repository.users.find((entry) => entry.user.githubAccessToken);

    let providerBranches: Array<GithubBranchInfo | GitlabBranchInfo> = [];
    try {
      if (repository.platform === Platform.GITHUB) {
        providerBranches = await this.githubService.getBranches(
          owner,
          repo,
          tokenOwner?.user.githubAccessToken || undefined,
        );
      } else {
        providerBranches = await this.gitlabService.getBranches(owner, repo);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch provider branches for ${repository.fullName}, falling back to observed branches`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    const observedEvents = await this.prisma.event.findMany({
      where: { repositoryId: id },
      select: {
        branch: true,
        sourceBranch: true,
        targetBranch: true,
        branches: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const observedBranches = observedEvents.flatMap((event) =>
      [...event.branches, event.branch, event.sourceBranch, event.targetBranch].filter(
        (branch): branch is string => Boolean(branch),
      ),
    );

    const branchMap = new Map<string, RepositoryBranchOption>();
    const ensureBranch = (name: string) => {
      const existing = branchMap.get(name);
      if (existing) {
        return existing;
      }

      const next: RepositoryBranchOption = {
        name,
        isDefault: name === repository.defaultBranch,
        isObserved: false,
      };
      branchMap.set(name, next);
      return next;
    };

    for (const branch of providerBranches) {
      const option = ensureBranch(branch.name);
      option.isProtected = branch.isProtected;
      option.lastCommitSha = branch.lastCommitSha;
    }

    ensureBranch(repository.defaultBranch);

    for (const branch of observedBranches) {
      ensureBranch(branch).isObserved = true;
    }

    return Array.from(branchMap.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async update(id: string, dto: UpdateRepositoryDto) {
    return this.prisma.repository.update({
      where: { id },
      data: dto,
    });
  }

  async updateForUser(userId: string, id: string, dto: UpdateRepositoryDto) {
    await assertUserCanEditRepository(userId, id);
    return this.prisma.repository.update({
      where: { id },
      data: dto,
    });
  }

  async delete(userId: string, id: string) {
    const membership = await assertUserCanAccessRepository(userId, id);

    if (isEditableRepositoryAccessLevel(membership.accessLevel)) {
      const repository = await this.prisma.repository.findUnique({
        where: { id },
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  githubAccessToken: true,
                },
              },
            },
          },
        },
      });

      if (!repository) {
        throw new NotFoundException('Repository not found');
      }

      const [owner, repo] = this.parseRepositoryPath(repository.fullName);
      const tokenOwner = repository.users.find((entry) => entry.user.githubAccessToken);

      if (repository.webhookId) {
        try {
          if (repository.platform === Platform.GITHUB) {
            await this.githubService.deleteWebhook(
              owner,
              repo,
              repository.webhookId,
              tokenOwner?.user.githubAccessToken || undefined,
            );
          } else {
            await this.gitlabService.deleteWebhook(owner, repo, Number(repository.webhookId));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown_error';
          this.logger.warn(
            `Failed to clean up webhook for repository ${repository.fullName}: ${message}`,
          );
        }
      }

      await this.prisma.repository.delete({
        where: { id },
      });

      this.logger.log(`Repository ${repository.fullName} deleted globally by user ${userId}`);
    } else {
      await this.prisma.userRepository.delete({
        where: {
          userId_repositoryId: {
            userId,
            repositoryId: id,
          },
        },
      });
      this.logger.log(`Repository membership for ${id} deleted for user ${userId}`);
    }

    return { success: true };
  }

  async sync(
    id: string,
    options?: {
      daysBack?: number;
      onStageStart?: (stage: Exclude<RepositorySyncStage, 'done'>) => void;
    },
  ): Promise<SyncSummary> {
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: {
              select: {
                githubAccessToken: true,
                githubRefreshToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }
    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    const daysBack = options?.daysBack ?? 7;
    const sinceDate =
      repository.lastSyncAt ?? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const since = sinceDate.toISOString();
    const failedSources: string[] = [];
    let createdCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let successfulSources = 0;

    if (repository.platform === Platform.GITHUB) {
      const tokenOwner = repository.users.find((entry) => entry.user.githubAccessToken);
      if (!tokenOwner?.user.githubAccessToken) {
        failedSources.push('github_token_missing');
      } else {
        const branches = await this.githubService.getBranches(
          owner,
          repo,
          tokenOwner.user.githubAccessToken || undefined,
        );
        const branchNames =
          branches.length > 0
            ? branches.map((branch) => branch.name)
            : [repository.defaultBranch];
        const commitSources = branchNames.map((branchName) => ({
          name: `github_commits:${branchName}`,
          stage: 'commits' as const,
          fetch: () =>
            this.githubService.getCommits(
              owner,
              repo,
              { branch: branchName, since },
              tokenOwner.user.githubAccessToken || undefined,
            ),
          normalize: (item: unknown) => this.normalizeGithubCommit(item, branchName),
        }));
        const sources = [
          ...commitSources,
          {
            name: 'github_pull_requests',
            stage: 'prs' as const,
            fetch: () =>
              this.githubService.getPullRequests(
                owner,
                repo,
                'all',
                tokenOwner.user.githubAccessToken || undefined,
              ),
            normalize: (item: unknown) => this.normalizeGithubPullRequest(item, sinceDate),
          },
          {
            name: 'github_issues',
            stage: 'issues' as const,
            fetch: () =>
              this.githubService.getIssues(
                owner,
                repo,
                'all',
                tokenOwner.user.githubAccessToken || undefined,
              ),
            normalize: (item: unknown) => this.normalizeGithubIssue(item, sinceDate),
          },
        ];

        const summary = await this.syncSources(repository.id, sources, failedSources, options?.onStageStart);
        createdCount += summary.createdCount;
        skippedCount += summary.skippedCount;
        updatedCount += summary.updatedCount;
        successfulSources += summary.successfulSources;
      }
    } else {
      const branches = await this.gitlabService.getBranches(owner, repo);
      const branchNames =
        branches.length > 0
          ? branches.map((branch) => branch.name)
          : [repository.defaultBranch];
      const commitSources = branchNames.map((branchName) => ({
        name: `gitlab_commits:${branchName}`,
        stage: 'commits' as const,
        fetch: () =>
          this.gitlabService.getCommits(owner, repo, {
            branch: branchName,
            since,
          }),
        normalize: (item: unknown) => this.normalizeGitlabCommit(item, branchName),
      }));
      const sources = [
        ...commitSources,
        {
          name: 'gitlab_merge_requests',
          stage: 'prs' as const,
          fetch: () => this.gitlabService.getMergeRequests(owner, repo, 'all'),
          normalize: (item: unknown) => this.normalizeGitlabMergeRequest(item, sinceDate),
        },
        {
          name: 'gitlab_issues',
          stage: 'issues' as const,
          fetch: () => this.gitlabService.getIssues(owner, repo, 'all'),
          normalize: (item: unknown) => this.normalizeGitlabIssue(item, sinceDate),
        },
      ];

      const summary = await this.syncSources(repository.id, sources, failedSources, options?.onStageStart);
      createdCount += summary.createdCount;
      skippedCount += summary.skippedCount;
      updatedCount += summary.updatedCount;
      successfulSources += summary.successfulSources;
    }

    const completedAt =
      successfulSources > 0 ? new Date() : repository.lastSyncAt || new Date(sinceDate);
    if (successfulSources > 0) {
      await this.prisma.repository.update({
        where: { id },
        data: { lastSyncAt: completedAt },
      });
    }

    this.logger.log(
      `repository_sync_completed repositoryId=${id} createdCount=${createdCount} updatedCount=${updatedCount} skippedCount=${skippedCount} failedSources=${failedSources.join(',') || 'none'}`,
    );

    return {
      repositoryId: id,
      createdCount,
      skippedCount,
      updatedCount,
      failedSources,
      lastSyncAt: completedAt.toISOString(),
    };
  }

  /**
   * 重新注册 Webhook
   */
  async registerWebhook(userId: string, id: string) {
    return this.retryWebhook(userId, id);
  }

  async getWebhookStatus(userId: string, id: string) {
    await assertUserCanEditRepository(userId, id);

    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          where: { userId },
          include: {
            user: {
              select: {
                githubAccessToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    if (repository.platform !== Platform.GITHUB) {
      throw new BadRequestException(
        'Webhook management currently supports GitHub repositories only',
      );
    }

    const userOAuthToken = repository.users[0]?.user.githubAccessToken;
    if (!userOAuthToken) {
      throw new BadRequestException('GitHub account is not connected');
    }

    if (!repository.webhookId) {
      return this.persistWebhookStatus(id, {
        webhookStatus: WebhookStatus.NOT_CONFIGURED,
        webhookError: 'Webhook ID is not configured',
        webhookId: null,
      });
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);

    try {
      const webhook = await this.githubService.getWebhook(
        owner,
        repo,
        repository.webhookId,
        userOAuthToken,
      );
      return this.persistWebhookStatus(id, {
        webhookStatus: webhook.active ? WebhookStatus.ACTIVE : WebhookStatus.FAILED,
        webhookError: webhook.active
          ? undefined
          : webhook.last_response?.message || 'Webhook is inactive on GitHub',
        webhookId: String(webhook.id),
      });
    } catch (error) {
      const result = this.classifyWebhookError(error, { notFoundMeansScope: false });
      return this.persistWebhookStatus(id, {
        ...result,
        webhookId: repository.webhookId,
      });
    }
  }

  async retryWebhook(userId: string, id: string) {
    await assertUserCanEditRepository(userId, id);

    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          where: { userId },
          include: {
            user: {
              select: {
                githubAccessToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    if (repository.platform !== Platform.GITHUB) {
      throw new BadRequestException(
        'Webhook re-registration currently supports GitHub repositories only',
      );
    }

    const userOAuthToken = repository.users[0]?.user.githubAccessToken;
    if (!userOAuthToken) {
      throw new BadRequestException('GitHub account is not connected');
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    const webhookSecret = repository.webhookSecret || this.generateWebhookSecret();

    const result = await this.provisionWebhook({
      repositoryId: id,
      platform: repository.platform,
      owner,
      repo,
      fullName: repository.fullName,
      webhookSecret,
      userOAuthToken,
    });

    this.logger.log(
      `Webhook re-registered for ${repository.fullName} by user ${userId} status=${result.webhookStatus}`,
    );
    return result;
  }

  async testWebhook(userId: string, id: string) {
    await assertUserCanEditRepository(userId, id);

    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          where: { userId },
          include: {
            user: {
              select: {
                githubAccessToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }
    if (repository.platform !== Platform.GITHUB) {
      throw new BadRequestException('Webhook test currently supports GitHub repositories only');
    }
    if (!repository.webhookId) {
      throw new BadRequestException('Webhook is not configured');
    }

    const userOAuthToken = repository.users[0]?.user.githubAccessToken;
    if (!userOAuthToken) {
      throw new BadRequestException('GitHub account is not connected');
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    await this.githubService.pingWebhook(owner, repo, repository.webhookId, userOAuthToken);
    return this.persistWebhookStatus(id, {
      webhookStatus: WebhookStatus.ACTIVE,
      webhookId: repository.webhookId,
    });
  }

  async batchRetryWebhooks(userId: string) {
    const memberships = await this.prisma.userRepository.findMany({
      where: {
        userId,
        accessMode: RepositoryAccessMode.EDITABLE,
        accessLevel: {
          in: [
            RepositoryAccessLevel.OWNER,
            RepositoryAccessLevel.ADMIN,
            RepositoryAccessLevel.MAINTAIN,
            RepositoryAccessLevel.WRITE,
          ],
        },
        repository: {
          isActive: true,
          platform: Platform.GITHUB,
        },
      },
      include: {
        repository: true,
      },
    });

    const failures: Array<{ repositoryId: string; fullName: string; reason: string }> = [];
    let succeeded = 0;

    for (const membership of memberships) {
      try {
        const result = await this.retryWebhook(userId, membership.repositoryId);
        if (result.webhookStatus === WebhookStatus.ACTIVE) {
          succeeded += 1;
        } else {
          failures.push({
            repositoryId: membership.repositoryId,
            fullName: membership.repository.fullName,
            reason: result.webhookError || result.webhookStatus,
          });
        }
      } catch (error) {
        failures.push({
          repositoryId: membership.repositoryId,
          fullName: membership.repository.fullName,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      total: memberships.length,
      succeeded,
      failed: failures.length,
      failures,
    };
  }

  private async provisionWebhook(input: {
    repositoryId: string;
    platform: Platform;
    owner: string;
    repo: string;
    fullName: string;
    webhookSecret: string;
    userOAuthToken?: string;
  }): Promise<WebhookProvisionResult> {
    const apiUrl = (await this.appConfigService.get(
      'API_URL',
      this.configService.get<string>('API_URL') || API_URL_FALLBACK,
    )).replace(/\/+$/, '');

    if (input.platform === Platform.GITLAB) {
      try {
        const webhookUrl = `${apiUrl}/webhooks/gitlab`;
        await this.gitlabService.createWebhook(
          input.owner,
          input.repo,
          webhookUrl,
          input.webhookSecret,
        );
        return this.persistWebhookStatus(input.repositoryId, {
          webhookStatus: WebhookStatus.ACTIVE,
          webhookError: undefined,
          webhookId: null,
        }, input.webhookSecret);
      } catch (error) {
        const result = this.classifyWebhookError(error, { notFoundMeansScope: false });
        this.logger.warn(
          `Failed to register GitLab webhook for ${input.fullName}: ${result.webhookError}`,
        );
        return this.persistWebhookStatus(input.repositoryId, result, input.webhookSecret);
      }
    }

    const webhookUrl = `${apiUrl}/webhooks/github`;

    try {
      const webhookId = await this.githubService.createWebhook(
        input.owner,
        input.repo,
        webhookUrl,
        input.webhookSecret,
        input.userOAuthToken,
      );

      return this.persistWebhookStatus(input.repositoryId, {
        webhookStatus: WebhookStatus.ACTIVE,
        webhookError: undefined,
        webhookId: String(webhookId),
      }, input.webhookSecret);
    } catch (error) {
      if (this.isHookAlreadyExistsError(error)) {
        const healed = await this.recreateExistingGithubWebhook(input, webhookUrl);
        if (healed) {
          return healed;
        }
      }

      const result = this.classifyWebhookError(error, { notFoundMeansScope: true });
      this.logger.warn(
        `Failed to register GitHub webhook for ${input.fullName}: ${result.webhookError}`,
      );
      return this.persistWebhookStatus(input.repositoryId, result, input.webhookSecret);
    }
  }

  private async recreateExistingGithubWebhook(
    input: {
      repositoryId: string;
      owner: string;
      repo: string;
      fullName: string;
      webhookSecret: string;
      userOAuthToken?: string;
    },
    webhookUrl: string,
  ): Promise<WebhookProvisionResult | null> {
    try {
      const hooks = await this.githubService.listWebhooks(
        input.owner,
        input.repo,
        input.userOAuthToken,
      );
      const staleHook = hooks.find((hook) => {
        const url = hook.config?.url || '';
        return url === webhookUrl || url.endsWith('/webhooks/github');
      });

      if (!staleHook) {
        return null;
      }

      await this.githubService.deleteWebhook(
        input.owner,
        input.repo,
        String(staleHook.id),
        input.userOAuthToken,
      );
      const webhookId = await this.githubService.createWebhook(
        input.owner,
        input.repo,
        webhookUrl,
        input.webhookSecret,
        input.userOAuthToken,
      );

      this.logger.log(
        `Recreated existing GitHub webhook for ${input.fullName}, old=${staleHook.id}, new=${webhookId}`,
      );

      return this.persistWebhookStatus(input.repositoryId, {
        webhookStatus: WebhookStatus.ACTIVE,
        webhookError: undefined,
        webhookId: String(webhookId),
      }, input.webhookSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to self-heal existing GitHub webhook for ${input.fullName}: ${message}`,
      );
      return null;
    }
  }

  private async persistWebhookStatus(
    repositoryId: string,
    result: WebhookProvisionResult,
    webhookSecret?: string,
  ): Promise<WebhookProvisionResult> {
    await this.prisma.repository.update({
      where: { id: repositoryId },
      data: {
        webhookId: result.webhookId === undefined ? undefined : result.webhookId,
        webhookSecret,
        webhookStatus: result.webhookStatus,
        webhookError: result.webhookError ?? null,
      },
    });

    return {
      webhookStatus: result.webhookStatus,
      webhookError: result.webhookError,
      webhookId: result.webhookId,
    };
  }

  private classifyWebhookError(
    error: unknown,
    options: { notFoundMeansScope: boolean },
  ): WebhookProvisionResult {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const providerMessage = this.getProviderErrorMessage(error);
      if (status === 401 || status === 403) {
        return {
          webhookStatus: WebhookStatus.INSUFFICIENT_SCOPE,
          webhookError: providerMessage || 'GitHub token lacks webhook administration permission',
        };
      }
      if (status === 404) {
        return {
          webhookStatus: options.notFoundMeansScope
            ? WebhookStatus.INSUFFICIENT_SCOPE
            : WebhookStatus.NOT_FOUND,
          webhookError: providerMessage || 'Webhook or repository was not found',
        };
      }

      return {
        webhookStatus: WebhookStatus.FAILED,
        webhookError: providerMessage || error.message,
      };
    }

    return {
      webhookStatus: WebhookStatus.FAILED,
      webhookError: error instanceof Error ? error.message : String(error),
    };
  }

  private isHookAlreadyExistsError(error: unknown): boolean {
    if (!axios.isAxiosError(error) || error.response?.status !== 422) {
      return false;
    }
    return this.getProviderErrorMessage(error).toLowerCase().includes('hook already exists');
  }

  private getProviderErrorMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error.message : String(error);
    }

    const data = error.response?.data as {
      message?: unknown;
      errors?: Array<{ message?: unknown }>;
    } | undefined;
    const message = typeof data?.message === 'string' ? data.message : '';
    const detail = data?.errors
      ?.map((item) => (typeof item.message === 'string' ? item.message : ''))
      .filter(Boolean)
      .join('; ');
    return [message, detail].filter(Boolean).join(': ') || error.message;
  }

  async getUserRepositories(userId: string) {
    return this.prisma.userRepository.findMany({
      where: { userId },
      include: { repository: true },
    });
  }

  async searchRepositories(query: string, page = 1) {
    const results = await this.githubService.searchRepositories(query, page);
    return results.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      stargazersCount: repo.stargazers_count,
      language: repo.language,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
      platform: 'GITHUB' as const,
    }));
  }

  async searchUserRepositories(
    userId: string,
    userOAuthToken: string,
    userRefreshToken?: string,
    githubLogin?: string | null,
  ) {
    if (!userOAuthToken) {
      this.logger.warn('No user OAuth token available for repository lookup');
      return [];
    }

    const monitoredExternalIds = await this.getMonitoredGithubExternalIds(userId);
    const repos = await this.githubService.getUserRepositories(
      userOAuthToken,
      userRefreshToken,
    );
    return repos.map((repo) => {
      const accessLevel = this.resolveGithubAccessLevel(repo, githubLogin);
      const isEditable = isEditableRepositoryAccessLevel(accessLevel);
      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        htmlUrl: repo.html_url,
        stargazersCount: repo.stargazers_count,
        language: repo.language,
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url,
        },
        platform: 'GITHUB' as const,
        accessLevel: this.mapAccessLevelToApi(accessLevel),
        canOperate: isEditable,
        isEditable,
        isMonitored: monitoredExternalIds.has(String(repo.id)),
      };
    });
  }

  async searchStarredRepositories(
    userId: string,
    userOAuthToken: string,
    userRefreshToken?: string,
  ) {
    if (!userOAuthToken) {
      this.logger.warn('No user OAuth token available for starred repository lookup');
      return [];
    }

    const monitoredExternalIds = await this.getMonitoredGithubExternalIds(userId);
    const repos = await this.githubService.getStarredRepos(
      userOAuthToken,
      userRefreshToken,
    );
    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      stargazersCount: repo.stargazers_count,
      language: repo.language,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
      platform: 'GITHUB' as const,
      accessLevel: this.mapAccessLevelToApi(RepositoryAccessLevel.READ),
      canOperate: false,
      isEditable: false,
      isMonitored: monitoredExternalIds.has(String(repo.id)),
    }));
  }

  private async getMonitoredGithubExternalIds(userId: string): Promise<Set<string>> {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    if (monitoredRepositoryIds.length === 0) {
      return new Set();
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        id: { in: monitoredRepositoryIds },
        platform: Platform.GITHUB,
      },
      select: { externalId: true },
    });

    return new Set(repositories.map((repository) => repository.externalId));
  }

  async syncForUser(
    userId: string,
    id: string,
    options?: { daysBack?: number },
  ): Promise<SyncSummary> {
    await assertUserCanAccessRepository(userId, id);
    const jobId = `manual-${Date.now()}`;
    const startedAt = Date.now();

    try {
      const summary = await this.sync(id, {
        ...options,
        onStageStart: (stage) => {
          this.eventGateway.broadcastRepositorySyncProgress({
            repositoryId: id,
            jobId,
            progress: STAGE_PROGRESS[stage],
            stage,
          });
        },
      });

      const durationMs = Date.now() - startedAt;
      this.eventGateway.broadcastRepositorySyncProgress({
        repositoryId: id,
        jobId,
        progress: 100,
        stage: 'done',
      });
      this.eventGateway.broadcastRepositorySynced({
        repositoryId: id,
        jobId,
        durationMs,
        syncedAt: new Date().toISOString(),
      });

      return summary;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.eventGateway.broadcastRepositorySyncFailed({
        repositoryId: id,
        jobId,
        reason,
        failedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  private async syncSources(
    repositoryId: string,
    sources: Array<{
      name: string;
      stage?: Exclude<RepositorySyncStage, 'done'>;
      fetch: () => Promise<unknown[]>;
      normalize: (item: unknown) => NormalizedSyncEvent | null;
    }>,
    failedSources: string[],
    onStageStart?: (stage: Exclude<RepositorySyncStage, 'done'>) => void,
  ): Promise<{
    createdCount: number;
    skippedCount: number;
    updatedCount: number;
    successfulSources: number;
  }> {
    let createdCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let successfulSources = 0;

    for (const source of sources) {
      try {
        if (source.stage) {
          onStageStart?.(source.stage);
        }
        const items = await source.fetch();
        successfulSources += 1;
        for (const item of items) {
          const normalized = source.normalize(item);
          if (!normalized) {
            skippedCount += 1;
            continue;
          }

          const existing = await this.eventService.findByExternalId(
            repositoryId,
            normalized.externalId,
          );
          if (existing) {
            const branches = this.resolveBranches(normalized.branches, [
              normalized.branch,
              normalized.sourceBranch,
              normalized.targetBranch,
            ]);
            const existingBranches = existing.branches ?? [];
            const mergedBranches = this.mergeBranches(existingBranches, branches);
            if (mergedBranches.length > existingBranches.length) {
              await this.prisma.event.update({
                where: { id: existing.id },
                data: { branches: mergedBranches },
              });
              updatedCount += 1;
            } else {
              skippedCount += 1;
            }
            continue;
          }

          const branches = this.resolveBranches(normalized.branches, [
            normalized.branch,
            normalized.sourceBranch,
            normalized.targetBranch,
          ]);

          await this.eventService.create({
            repositoryId,
            type: normalized.type,
            action: normalized.action,
            title: normalized.title,
            body: normalized.body,
            author: normalized.author,
            authorAvatar: normalized.authorAvatar,
            externalId: normalized.externalId,
            externalUrl: normalized.externalUrl,
            branch: normalized.branch,
            sourceBranch: normalized.sourceBranch,
            targetBranch: normalized.targetBranch,
            branches,
            occurredAt: normalized.occurredAt,
            metadata: normalized.metadata,
          });
          createdCount += 1;
        }
      } catch (error) {
        failedSources.push(source.name);
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.error(
          `Failed to sync source ${source.name} for repository ${repositoryId}: ${message}`,
        );
      }
    }

    return { createdCount, skippedCount, updatedCount, successfulSources };
  }

  private resolveBranches(
    explicitBranches: string[] | undefined,
    fallbackBranches: Array<string | undefined>,
  ): string[] {
    const rawBranches = explicitBranches && explicitBranches.length > 0
      ? explicitBranches
      : fallbackBranches;

    return Array.from(
      new Set(
        rawBranches
          .filter((branch): branch is string => typeof branch === 'string')
          .map((branch) => branch.trim())
          .filter(Boolean),
      ),
    );
  }

  private mergeBranches(existingBranches: string[], incomingBranches: string[]): string[] {
    return this.resolveBranches([...existingBranches, ...incomingBranches], []);
  }

  private resolveGithubAccessLevel(
    repo: GithubRepoResponse,
    githubLogin?: string | null,
  ): RepositoryAccessLevel {
    if (githubLogin && repo.owner?.login?.toLowerCase() === githubLogin.toLowerCase()) {
      return RepositoryAccessLevel.OWNER;
    }

    const permissions = repo.permissions;
    if (permissions?.admin) {
      return RepositoryAccessLevel.ADMIN;
    }
    if (permissions?.maintain) {
      return RepositoryAccessLevel.MAINTAIN;
    }
    if (permissions?.push) {
      return RepositoryAccessLevel.WRITE;
    }
    if (permissions?.triage) {
      return RepositoryAccessLevel.TRIAGE;
    }
    if (permissions?.pull) {
      return RepositoryAccessLevel.READ;
    }

    return RepositoryAccessLevel.NONE;
  }

  private resolveAccessModeFromLevel(accessLevel: RepositoryAccessLevel): RepositoryAccessMode {
    return isEditableRepositoryAccessLevel(accessLevel)
      ? RepositoryAccessMode.EDITABLE
      : RepositoryAccessMode.MONITOR;
  }

  private mapAccessLevelToApi(accessLevel: RepositoryAccessLevel): RepositoryAccessLevelApi {
    switch (accessLevel) {
      case RepositoryAccessLevel.OWNER:
        return 'owner';
      case RepositoryAccessLevel.ADMIN:
        return 'admin';
      case RepositoryAccessLevel.MAINTAIN:
        return 'maintain';
      case RepositoryAccessLevel.WRITE:
        return 'write';
      case RepositoryAccessLevel.TRIAGE:
        return 'triage';
      case RepositoryAccessLevel.READ:
        return 'read';
      default:
        return 'none';
    }
  }

  private attachRepositoryAccessView<T extends Record<string, unknown>>(
    repository: T,
    membership?: RepositoryMembershipView | null,
    isMonitored = false,
  ): T & {
    accessLevel: RepositoryAccessLevelApi;
    canOperate: boolean;
    isMonitored: boolean;
    isEditable: boolean;
  } {
    const accessLevel = membership?.accessLevel ?? RepositoryAccessLevel.NONE;
    const isEditable = isEditableRepositoryAccessLevel(accessLevel);

    return {
      ...repository,
      accessLevel: this.mapAccessLevelToApi(accessLevel),
      canOperate: isEditable,
      isMonitored,
      isEditable,
    };
  }

  private parseRepositoryPath(fullName: string): [string, string] {
    const separatorIndex = fullName.lastIndexOf('/');
    if (separatorIndex === -1) {
      return [fullName, fullName];
    }

    return [fullName.slice(0, separatorIndex), fullName.slice(separatorIndex + 1)];
  }

  private normalizeGithubCommit(item: unknown, branch: string): NormalizedSyncEvent | null {
    const commit = item as {
      sha?: string;
      html_url?: string;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string };
      };
      author?: { login?: string; avatar_url?: string };
    };

    if (!commit.sha) {
      return null;
    }

    return {
      type: EventType.PUSH,
      action: 'sync',
      title: `Push sync (${branch}): ${commit.sha.slice(0, 7)}`,
      body: commit.commit?.message,
      author: commit.commit?.author?.name || commit.author?.login || 'unknown',
      authorAvatar: commit.author?.avatar_url,
      externalId: commit.sha,
      externalUrl: commit.html_url,
      branch,
      branches: [branch],
      occurredAt: new Date(commit.commit?.author?.date || new Date()),
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        branch,
        githubLogin: commit.author?.login || null,
      },
    };
  }

  private normalizeGithubPullRequest(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const pr = item as {
      id?: number;
      title?: string;
      body?: string | null;
      html_url?: string;
      state?: string;
      merged_at?: string | null;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      head?: { ref?: string };
      base?: { ref?: string };
      user?: { login?: string; avatar_url?: string };
      number?: number;
    };

    if (!pr.id || !this.isRecentEnough(pr.updated_at ?? pr.created_at, sinceDate)) {
      return null;
    }

    const merged = Boolean(pr.merged_at);
    const type = merged
      ? EventType.PR_MERGED
      : pr.state === 'closed'
        ? EventType.PR_CLOSED
        : EventType.PR_OPENED;

    return {
      type,
      action: merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'opened',
      title: pr.title || 'Pull request sync',
      body: pr.body || undefined,
      author: pr.user?.login || 'unknown',
      authorAvatar: pr.user?.avatar_url,
      externalId: `gh-pr-${pr.id}`,
      externalUrl: pr.html_url,
      branch: pr.base?.ref,
      sourceBranch: pr.head?.ref,
      targetBranch: pr.base?.ref,
      branches: this.resolveBranches(undefined, [pr.head?.ref, pr.base?.ref]),
      occurredAt: new Date(
        merged
          ? pr.merged_at || pr.closed_at || pr.updated_at || pr.created_at || new Date().toISOString()
          : pr.state === 'closed'
            ? pr.closed_at || pr.updated_at || pr.created_at || new Date().toISOString()
            : pr.created_at || pr.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        prNumber: pr.number,
      },
    };
  }

  private normalizeGithubIssue(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const issue = item as {
      id?: number;
      title?: string;
      body?: string | null;
      html_url?: string;
      state?: string;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      number?: number;
      user?: { login?: string; avatar_url?: string };
      pull_request?: unknown;
    };

    if (
      issue.pull_request ||
      !issue.id ||
      !this.isRecentEnough(issue.updated_at ?? issue.created_at, sinceDate)
    ) {
      return null;
    }

    return {
      type: issue.state === 'closed' ? EventType.ISSUE_CLOSED : EventType.ISSUE_OPENED,
      action: issue.state === 'closed' ? 'closed' : 'opened',
      title: issue.title || 'Issue sync',
      body: issue.body || undefined,
      author: issue.user?.login || 'unknown',
      authorAvatar: issue.user?.avatar_url,
      externalId: `gh-issue-${issue.id}`,
      externalUrl: issue.html_url,
      branches: [],
      occurredAt: new Date(
        issue.state === 'closed'
          ? issue.closed_at || issue.updated_at || issue.created_at || new Date().toISOString()
          : issue.created_at || issue.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        issueNumber: issue.number,
      },
    };
  }

  private normalizeGitlabCommit(item: unknown, branch: string): NormalizedSyncEvent | null {
    const commit = item as {
      id?: string;
      message?: string;
      web_url?: string;
      author_name?: string;
      authored_date?: string;
      committed_date?: string;
      created_at?: string;
    };

    if (!commit.id) {
      return null;
    }

    return {
      type: EventType.PUSH,
      action: 'sync',
      title: `Push sync (${branch}): ${commit.id.slice(0, 7)}`,
      body: commit.message,
      author: commit.author_name || 'unknown',
      externalId: commit.id,
      externalUrl: commit.web_url,
      branch,
      branches: [branch],
      occurredAt: new Date(
        commit.authored_date || commit.committed_date || commit.created_at || new Date(),
      ),
      metadata: { source: 'repository_sync', provider: 'gitlab', branch },
    };
  }

  private normalizeGitlabMergeRequest(
    item: unknown,
    sinceDate: Date,
  ): NormalizedSyncEvent | null {
    const mr = item as {
      id?: number;
      title?: string;
      description?: string | null;
      web_url?: string;
      state?: string;
      merged_at?: string | null;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      source_branch?: string;
      target_branch?: string;
      author?: { username?: string; avatar_url?: string };
      iid?: number;
    };

    if (!mr.id || !this.isRecentEnough(mr.updated_at ?? mr.created_at, sinceDate)) {
      return null;
    }

    const merged = Boolean(mr.merged_at);
    const type = merged
      ? EventType.PR_MERGED
      : mr.state === 'closed'
        ? EventType.PR_CLOSED
        : EventType.PR_OPENED;

    return {
      type,
      action: merged ? 'merged' : mr.state === 'closed' ? 'closed' : 'opened',
      title: mr.title || 'Merge request sync',
      body: mr.description || undefined,
      author: mr.author?.username || 'unknown',
      authorAvatar: mr.author?.avatar_url,
      externalId: `gl-mr-${mr.id}`,
      externalUrl: mr.web_url,
      branch: mr.target_branch,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      branches: this.resolveBranches(undefined, [mr.source_branch, mr.target_branch]),
      occurredAt: new Date(
        merged
          ? mr.merged_at || mr.closed_at || mr.updated_at || mr.created_at || new Date().toISOString()
          : mr.state === 'closed'
            ? mr.closed_at || mr.updated_at || mr.created_at || new Date().toISOString()
            : mr.created_at || mr.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'gitlab',
        mrIid: mr.iid,
      },
    };
  }

  private normalizeGitlabIssue(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const issue = item as {
      id?: number;
      title?: string;
      description?: string | null;
      web_url?: string;
      state?: string;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      author?: { username?: string; avatar_url?: string };
      iid?: number;
    };

    if (!issue.id || !this.isRecentEnough(issue.updated_at ?? issue.created_at, sinceDate)) {
      return null;
    }

    return {
      type: issue.state === 'closed' ? EventType.ISSUE_CLOSED : EventType.ISSUE_OPENED,
      action: issue.state === 'closed' ? 'closed' : 'opened',
      title: issue.title || 'Issue sync',
      body: issue.description || undefined,
      author: issue.author?.username || 'unknown',
      authorAvatar: issue.author?.avatar_url,
      externalId: `gl-issue-${issue.id}`,
      externalUrl: issue.web_url,
      branches: [],
      occurredAt: new Date(
        issue.state === 'closed'
          ? issue.closed_at || issue.updated_at || issue.created_at || new Date().toISOString()
          : issue.created_at || issue.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'gitlab',
        issueIid: issue.iid,
      },
    };
  }

  private isRecentEnough(dateValue: string | undefined, sinceDate: Date): boolean {
    if (!dateValue) {
      return false;
    }

    return new Date(dateValue).getTime() >= sinceDate.getTime();
  }

  private generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }

  async getContributors(id: string, userOAuthToken?: string): Promise<any[]> {
    const cacheKey = `${id}:${userOAuthToken || 'default'}`;
    const cached = this.contributorsCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const repository = await this.prisma.repository.findUnique({
      where: { id },
    });
    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    let contributors: any[] = [];
    const parts = repository.fullName.split('/');
    const owner = parts[0];
    const repo = parts[1];

    if (repository.platform === Platform.GITHUB) {
      const gitContributors = await this.githubService.getContributors(owner, repo, userOAuthToken);
      contributors = gitContributors.map(item => ({
        username: item.login,
        avatarUrl: item.avatar_url,
      }));
    } else if (repository.platform === Platform.GITLAB) {
      contributors = await this.gitlabService.getContributors(owner, repo);
    }

    this.contributorsCache.set(cacheKey, {
      data: contributors,
      expiry: Date.now() + 60 * 60 * 1000, // 1 hour TTL
    });

    return contributors;
  }
}
