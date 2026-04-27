import { Injectable, Logger } from '@nestjs/common';
import { prisma, EventType, Platform } from '@repo-pulse/database';
import { GithubService } from '../repository/services/github.service';
import { RepositoryService } from '../repository/repository.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly githubService: GithubService,
    private readonly repositoryService: RepositoryService,
  ) {}

  /**
   * 同步用户的所有仓库（自己的 + starred）
   * 登录后自动调用
   */
  async syncUserRepositories(userId: string): Promise<{ synced: number; starred: number }> {
    this.logger.log(`Starting to sync repositories for user: ${userId}`);

    // 获取用户的 GitHub tokens
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true, githubRefreshToken: true },
    });

    if (!user?.githubAccessToken) {
      this.logger.warn(`User ${userId} has no GitHub access token`);
      return { synced: 0, starred: 0 };
    }

    let synced = 0;
    let starred = 0;

    try {
      // 1. 同步用户拥有的/协作的仓库
      const userRepos = await this.githubService.getUserRepositories(
        user.githubAccessToken,
        user.githubRefreshToken || undefined,
      );

      this.logger.log(`GitHub API returned ${userRepos.length} user repositories`);

      for (const repo of userRepos) {
        try {
          // 检查仓库是否已存在
          let existing = await prisma.repository.findFirst({
            where: { externalId: String(repo.id) },
          });

          if (!existing) {
            // 创建新仓库（会自动创建 webhook）
            const [owner, repoName] = repo.full_name.split('/');
            existing = await this.repositoryService.create(userId, {
              platform: Platform.GITHUB,
              owner,
              repo: repoName,
            }, user.githubAccessToken);
            synced++;
            this.logger.log(`Created new repository: ${repo.full_name}`);
          } else {
            // 检查用户是否已关联此仓库
            const userRepo = await prisma.userRepository.findUnique({
              where: {
                userId_repositoryId: {
                  userId,
                  repositoryId: existing.id,
                },
              },
            });

            // 如果用户未关联，则添加关联
            if (!userRepo) {
              await prisma.userRepository.create({
                data: {
                  userId,
                  repositoryId: existing.id,
                  role: 'MEMBER',
                },
              });
              this.logger.log(`Linked existing repository ${repo.full_name} to user`);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to sync repository ${repo.full_name}`, error);
        }
      }

      // 2. 同步 starred 仓库
      const starredRepos = await this.githubService.getStarredRepos(
        user.githubAccessToken,
        user.githubRefreshToken || undefined,
      );

      this.logger.log(`GitHub API returned ${starredRepos.length} starred repositories`);

      for (const repo of starredRepos) {
        try {
          // 检查仓库是否已存在
          let existing = await prisma.repository.findFirst({
            where: { externalId: String(repo.id) },
          });

          if (!existing) {
            // 创建新仓库
            const [owner, repoName] = repo.full_name.split('/');
            existing = await this.repositoryService.create(userId, {
              platform: Platform.GITHUB,
              owner,
              repo: repoName,
            }, user.githubAccessToken);
            starred++;
            this.logger.log(`Created starred repository: ${repo.full_name}`);
          } else {
            // 检查用户是否已关联此仓库
            const userRepo = await prisma.userRepository.findUnique({
              where: {
                userId_repositoryId: {
                  userId,
                  repositoryId: existing.id,
                },
              },
            });

            // 如果用户未关联，则添加关联
            if (!userRepo) {
              await prisma.userRepository.create({
                data: {
                  userId,
                  repositoryId: existing.id,
                  role: 'MEMBER',
                },
              });
              this.logger.log(`Linked existing starred repository ${repo.full_name} to user`);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to sync starred repository ${repo.full_name}`, error);
        }
      }

      this.logger.log(`Sync completed: ${synced} new repos, ${starred} new starred repos`);

      // 同步完仓库后，始终同步历史事件（不管是否有新仓库）
      setTimeout(() => {
        this.syncAllUserRepositoriesHistory(userId).catch((err) => {
          this.logger.error(`Failed to sync repository history for user ${userId}`, err);
        });
      }, 500);

      return { synced, starred };
    } catch (error) {
      this.logger.error(`Failed to sync user repositories`, error);
      return { synced: 0, starred: 0 };
    }
  }

  /**
   * 同步指定仓库的历史事件
   */
  async syncRepositoryHistory(
    repositoryId: string,
    options?: { daysBack?: number },
  ): Promise<{ commits: number; prs: number; issues: number }> {
    const daysBack = options?.daysBack || 30;
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    this.logger.log(`Syncing history for repository ${repositoryId}, days: ${daysBack}`);

    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        users: {
          include: { user: true },
        },
      },
    });

    if (!repository) {
      throw new Error(`Repository ${repositoryId} not found`);
    }

    const user = repository.users[0]?.user;
    if (!user?.githubAccessToken) {
      throw new Error(`No GitHub token for repository ${repositoryId}`);
    }

    const [owner, repo] = repository.fullName.split('/');
    let commits = 0;
    let prs = 0;
    let issues = 0;

    try {
      // 1. 同步 Commits
      const commitData = await this.githubService.getCommits(
        owner,
        repo,
        { since: since.toISOString() },
        user.githubAccessToken,
      );

      for (const commit of commitData as any[]) {
        const existingEvent = await prisma.event.findFirst({
          where: {
            repositoryId,
            externalId: commit.sha,
            type: EventType.PUSH,
          },
        });

        if (!existingEvent) {
          await prisma.event.create({
            data: {
              repositoryId,
              type: EventType.PUSH,
              action: 'pushed',
              externalId: commit.sha,
              title: commit.commit?.message?.split('\n')[0] || 'Push',
              body: commit.commit?.message || '',
              author: commit.commit?.author?.name || commit.commit?.author?.login || 'Unknown',
              createdAt: new Date(commit.commit?.author?.date || new Date()),
            },
          });
          commits++;
        }
      }

      // 2. 同步 Pull Requests
      const prData = await this.githubService.getPullRequests(
        owner,
        repo,
        'all',
        user.githubAccessToken,
      );

      for (const pr of prData as any[]) {
        const existingEvent = await prisma.event.findFirst({
          where: {
            repositoryId,
            externalId: String(pr.id),
          },
        });

        if (!existingEvent) {
          let eventType: EventType = EventType.PR_OPENED;
          let action = 'opened';
          if (pr.merged_at) {
            eventType = EventType.PR_MERGED;
            action = 'merged';
          } else if (pr.state === 'closed') {
            eventType = EventType.PR_CLOSED;
            action = 'closed';
          }

          await prisma.event.create({
            data: {
              repositoryId,
              type: eventType,
              action,
              externalId: String(pr.id),
              title: pr.title,
              body: pr.body || '',
              author: pr.user?.login || 'Unknown',
              createdAt: new Date(pr.created_at),
            },
          });
          prs++;
        }
      }

      // 3. 同步 Issues
      const issueData = await this.githubService.getIssues(
        owner,
        repo,
        'all',
        user.githubAccessToken,
      );

      for (const issue of issueData as any[]) {
        // 跳过 PR（GitHub API 返回的 issues 包含 PR）
        if (issue.pull_request) continue;

        const existingEvent = await prisma.event.findFirst({
          where: {
            repositoryId,
            externalId: String(issue.id),
          },
        });

        if (!existingEvent) {
          const eventType = issue.state === 'closed' ? EventType.ISSUE_CLOSED : EventType.ISSUE_OPENED;
          const action = issue.state === 'closed' ? 'closed' : 'opened';

          await prisma.event.create({
            data: {
              repositoryId,
              type: eventType,
              action,
              externalId: String(issue.id),
              title: issue.title,
              body: issue.body || '',
              author: issue.user?.login || 'Unknown',
              createdAt: new Date(issue.created_at),
            },
          });
          issues++;
        }
      }

      // 更新最后同步时间
      await prisma.repository.update({
        where: { id: repositoryId },
        data: { lastSyncAt: new Date() },
      });

      this.logger.log(`History sync completed: ${commits} commits, ${prs} PRs, ${issues} issues`);
      return { commits, prs, issues };
    } catch (error) {
      this.logger.error(`Failed to sync repository history`, error);
      throw error;
    }
  }

  /**
   * 同步用户的所有仓库的历史事件
   */
  async syncAllUserRepositoriesHistory(userId: string): Promise<void> {
    const repositories = await prisma.repository.findMany({
      where: {
        users: { some: { userId } },
      },
      select: { id: true },
    });

    for (const repo of repositories) {
      try {
        await this.syncRepositoryHistory(repo.id);
      } catch (error) {
        this.logger.error(`Failed to sync history for repository ${repo.id}`, error);
      }
    }
  }
}
