import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Platform, Repository, EventType } from '@repo-pulse/database';
import { randomBytes } from 'crypto';
import { GithubService } from './services/github.service';
import { GitlabService } from './services/gitlab.service';
import { CreateRepositoryDto, UpdateRepositoryDto } from './dto/repository.dto';
import { EventService } from '../event/event.service';

interface SyncSummary {
  repositoryId: string;
  createdCount: number;
  skippedCount: number;
  failedSources: string[];
  lastSyncAt: string;
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
  metadata: Record<string, unknown>;
}

@Injectable()
export class RepositoryService {
  private readonly logger = new Logger(RepositoryService.name);
  private prisma: PrismaClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly githubService: GithubService,
    private readonly gitlabService: GitlabService,
    private readonly eventService: EventService,
  ) {
    this.prisma = new PrismaClient();
  }

  async create(userId: string, dto: CreateRepositoryDto, userOAuthToken?: string) {
    const { platform, owner, repo } = dto;

    let repoInfo: {
      externalId: string;
      name: string;
      fullName: string;
      url: string;
      defaultBranch: string;
    };

    if (platform === Platform.GITHUB) {
      const githubRepo = await this.githubService.getRepository(owner, repo, userOAuthToken);
      repoInfo = {
        externalId: String(githubRepo.id),
        name: githubRepo.name,
        fullName: githubRepo.full_name,
        url: githubRepo.html_url,
        defaultBranch: githubRepo.default_branch || 'main',
      };
    } else {
      const gitlabRepo = await this.gitlabService.getRepository(owner, repo);
      repoInfo = {
        externalId: String(gitlabRepo.id),
        name: gitlabRepo.name,
        fullName: gitlabRepo.path_with_namespace,
        url: gitlabRepo.web_url,
        defaultBranch: gitlabRepo.default_branch || 'main',
      };
    }

    const webhookSecret = this.generateWebhookSecret();

    const repository = await this.prisma.repository.upsert({
      where: {
        platform_externalId: {
          platform,
          externalId: repoInfo.externalId,
        },
      },
      update: {
        isActive: true,
        webhookSecret,
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
      update: {},
      create: {
        userId,
        repositoryId: repository.id,
        role: 'ADMIN' as const,
      },
    });

    const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
    try {
      if (platform === Platform.GITHUB) {
        const webhookUrl = `${apiUrl}/webhooks/github`;
        const webhookId = await this.githubService.createWebhook(
          owner,
          repo,
          webhookUrl,
          webhookSecret,
          userOAuthToken,
        );
        if (webhookId) {
          await this.prisma.repository.update({
            where: { id: repository.id },
            data: { webhookId: String(webhookId) },
          });
        }
      } else {
        const webhookUrl = `${apiUrl}/webhooks/gitlab`;
        await this.gitlabService.createWebhook(owner, repo, webhookUrl, webhookSecret);
      }
    } catch (error) {
      this.logger.error(`Failed to register webhook for ${repoInfo.fullName}`, error);
    }

    this.logger.log(`Repository ${repoInfo.fullName} added successfully for user ${userId}`);
    return repository;
  }

  async findAll(userId: string, options?: { isActive?: boolean }) {
    const where: Record<string, unknown> = {};

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    return this.prisma.repository.findMany({
      where: {
        users: {
          some: { userId },
        },
        ...where,
      },
      include: {
        _count: {
          select: { events: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Repository & Record<string, unknown>> {
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        events: {
          take: 10,
          orderBy: { createdAt: 'desc' },
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

    return repository as Repository & Record<string, unknown>;
  }

  async update(id: string, dto: UpdateRepositoryDto) {
    return this.prisma.repository.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.prisma.repository.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  async sync(id: string): Promise<SyncSummary> {
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
    const sinceDate = repository.lastSyncAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const since = sinceDate.toISOString();
    const failedSources: string[] = [];
    let createdCount = 0;
    let skippedCount = 0;
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
        const commitSources = (branches.length > 0 ? branches : [repository.defaultBranch]).map(
          (branch) => ({
            name: `github_commits:${branch}`,
            fetch: () =>
              this.githubService.getCommits(
                owner,
                repo,
                { branch, since },
                tokenOwner.user.githubAccessToken || undefined,
              ),
            normalize: (item: unknown) => this.normalizeGithubCommit(item, branch),
          }),
        );
        const sources = [
          ...commitSources,
          {
            name: 'github_pull_requests',
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

        const summary = await this.syncSources(repository.id, sources, failedSources);
        createdCount += summary.createdCount;
        skippedCount += summary.skippedCount;
        successfulSources += summary.successfulSources;
      }
    } else {
      const branches = await this.gitlabService.getBranches(owner, repo);
      const commitSources = (branches.length > 0 ? branches : [repository.defaultBranch]).map(
        (branch) => ({
          name: `gitlab_commits:${branch}`,
          fetch: () =>
            this.gitlabService.getCommits(owner, repo, {
              branch,
              since,
            }),
          normalize: (item: unknown) => this.normalizeGitlabCommit(item, branch),
        }),
      );
      const sources = [
        ...commitSources,
        {
          name: 'gitlab_merge_requests',
          fetch: () => this.gitlabService.getMergeRequests(owner, repo, 'all'),
          normalize: (item: unknown) => this.normalizeGitlabMergeRequest(item, sinceDate),
        },
        {
          name: 'gitlab_issues',
          fetch: () => this.gitlabService.getIssues(owner, repo, 'all'),
          normalize: (item: unknown) => this.normalizeGitlabIssue(item, sinceDate),
        },
      ];

      const summary = await this.syncSources(repository.id, sources, failedSources);
      createdCount += summary.createdCount;
      skippedCount += summary.skippedCount;
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
      `repository_sync_completed repositoryId=${id} createdCount=${createdCount} skippedCount=${skippedCount} failedSources=${failedSources.join(',') || 'none'}`,
    );

    return {
      repositoryId: id,
      createdCount,
      skippedCount,
      failedSources,
      lastSyncAt: completedAt.toISOString(),
    };
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
    userOAuthToken: string,
    userRefreshToken?: string,
  ) {
    if (!userOAuthToken) {
      this.logger.warn('No user OAuth token available for repository lookup');
      return [];
    }

    const repos = await this.githubService.getUserRepositories(
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
    }));
  }

  async searchStarredRepositories(
    userOAuthToken: string,
    userRefreshToken?: string,
  ) {
    if (!userOAuthToken) {
      this.logger.warn('No user OAuth token available for starred repository lookup');
      return [];
    }

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
    }));
  }

  private async syncSources(
    repositoryId: string,
    sources: Array<{
      name: string;
      fetch: () => Promise<unknown[]>;
      normalize: (item: unknown) => NormalizedSyncEvent | null;
    }>,
    failedSources: string[],
  ): Promise<{ createdCount: number; skippedCount: number; successfulSources: number }> {
    let createdCount = 0;
    let skippedCount = 0;
    let successfulSources = 0;

    for (const source of sources) {
      try {
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
            skippedCount += 1;
            continue;
          }

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

    return { createdCount, skippedCount, successfulSources };
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
        author?: { name?: string };
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
      author: commit.author?.login || commit.commit?.author?.name || 'unknown',
      authorAvatar: commit.author?.avatar_url,
      externalId: commit.sha,
      externalUrl: commit.html_url,
      metadata: { source: 'repository_sync', provider: 'github', branch },
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
      updated_at?: string;
      created_at?: string;
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
      updated_at?: string;
      created_at?: string;
      number?: number;
      user?: { login?: string; avatar_url?: string };
      pull_request?: unknown;
    };

    if (issue.pull_request || !issue.id || !this.isRecentEnough(issue.updated_at ?? issue.created_at, sinceDate)) {
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
      updated_at?: string;
      created_at?: string;
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
}
