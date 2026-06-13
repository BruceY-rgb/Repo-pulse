import { Injectable, Logger } from '@nestjs/common';
import {
  EventType,
  Platform,
  RepositoryAccessLevel,
  RepositoryAccessMode,
  Role,
  prisma,
} from '@repo-pulse/database';
import { GithubService } from '../repository/services/github.service';
import { RepositoryService } from '../repository/repository.service';
import { BranchSyncService } from './branch-sync.service';
import { getUserMonitoredRepositoryIds } from '../../common/utils/repository-access';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly githubService: GithubService,
    private readonly repositoryService: RepositoryService,
    private readonly branchSyncService: BranchSyncService,
  ) {}

  private resolveGithubAccessLevel(
    repo: {
      owner?: { login?: string };
      permissions?: {
        admin?: boolean;
        maintain?: boolean;
        push?: boolean;
        triage?: boolean;
        pull?: boolean;
      };
    },
    githubLogin?: string | null,
  ): RepositoryAccessLevel {
    if (githubLogin && repo.owner?.login?.toLowerCase() === githubLogin.toLowerCase()) {
      return RepositoryAccessLevel.OWNER;
    }
    if (repo.permissions?.admin) {
      return RepositoryAccessLevel.ADMIN;
    }
    if (repo.permissions?.maintain) {
      return RepositoryAccessLevel.MAINTAIN;
    }
    if (repo.permissions?.push) {
      return RepositoryAccessLevel.WRITE;
    }
    if (repo.permissions?.triage) {
      return RepositoryAccessLevel.TRIAGE;
    }
    if (repo.permissions?.pull) {
      return RepositoryAccessLevel.READ;
    }

    return RepositoryAccessLevel.NONE;
  }

  private resolveAccessMode(accessLevel: RepositoryAccessLevel): RepositoryAccessMode {
    return (
      accessLevel === RepositoryAccessLevel.OWNER ||
      accessLevel === RepositoryAccessLevel.ADMIN ||
      accessLevel === RepositoryAccessLevel.MAINTAIN ||
      accessLevel === RepositoryAccessLevel.WRITE
    )
      ? RepositoryAccessMode.EDITABLE
      : RepositoryAccessMode.MONITOR;
  }

  async syncUserRepositories(
    userId: string,
    options?: { throwOnFetchError?: boolean },
  ): Promise<{ synced: number; starred: number }> {
    this.logger.log(`Starting to sync repositories for user: ${userId}`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true, githubRefreshToken: true, githubLogin: true },
    });

    if (!user?.githubAccessToken) {
      this.logger.warn(`User ${userId} has no GitHub access token`);
      return { synced: 0, starred: 0 };
    }

    let synced = 0;
    let starred = 0;

    try {
      const userRepos = await this.githubService.getUserRepositories(
        user.githubAccessToken,
        user.githubRefreshToken || undefined,
        { throwOnError: options?.throwOnFetchError },
      );
      this.logger.log(`GitHub API returned ${userRepos.length} user repositories`);

      for (const repo of userRepos) {
        try {
          const accessLevel = this.resolveGithubAccessLevel(repo, user.githubLogin);
          const accessMode = this.resolveAccessMode(accessLevel);
          // 可编辑仓库赋 ADMIN，与手动添加路径（repository.service.create）一致，
          // 否则 webhook 管理接口的 role==='ADMIN' 门禁会对同步发现的仓库一律 403。
          const role: Role = accessMode === RepositoryAccessMode.EDITABLE ? 'ADMIN' : 'VIEWER';
          let existing = await prisma.repository.findFirst({
            where: { externalId: String(repo.id) },
          });

          if (!existing) {
            const [owner, repoName] = repo.full_name.split('/');
            existing = await this.repositoryService.create(
              userId,
              {
                platform: Platform.GITHUB,
                owner,
                repo: repoName,
              },
              {
                userOAuthToken: user.githubAccessToken,
                accessMode,
                accessLevel,
                role,
                githubLogin: user.githubLogin ?? undefined,
              },
            );
            synced++;
            this.logger.log(`Created new repository: ${repo.full_name}`);
          } else {
            const userRepo = await prisma.userRepository.findUnique({
              where: {
                userId_repositoryId: {
                  userId,
                  repositoryId: existing.id,
                },
              },
            });

            if (!userRepo) {
              await prisma.userRepository.create({
                data: {
                  userId,
                  repositoryId: existing.id,
                  role,
                  accessMode,
                  accessLevel,
                },
              });
              this.logger.log(`Linked existing repository ${repo.full_name} to user`);
            } else {
              await prisma.userRepository.update({
                where: {
                  userId_repositoryId: {
                    userId,
                    repositoryId: existing.id,
                  },
                },
                data: {
                  role,
                  accessMode,
                  accessLevel,
                },
              });
            }
          }
        } catch (error) {
          this.logger.error(`Failed to sync repository ${repo.full_name}`, error);
        }
      }

      let starredRepos: Awaited<ReturnType<GithubService['getStarredRepos']>>;
      let shouldReconcileStarredState = false;
      try {
        starredRepos = await this.githubService.getStarredRepos(
          user.githubAccessToken,
          user.githubRefreshToken || undefined,
          { throwOnError: true },
        );
        shouldReconcileStarredState = true;
      } catch (error) {
        this.logger.error(`Failed to fetch starred repositories for user ${userId}`, error);
        starredRepos = [];
      }
      this.logger.log(`GitHub API returned ${starredRepos.length} starred repositories`);
      const starredExternalIds = starredRepos.map((repo) => String(repo.id));
      const monitoredRepositoryIdSet = new Set(await getUserMonitoredRepositoryIds(userId));
      const monitoredStarredRepositoryIds = new Set<string>();
      const trackStarredHistorySync = (repositoryId: string) => {
        if (monitoredRepositoryIdSet.has(repositoryId)) {
          monitoredStarredRepositoryIds.add(repositoryId);
        }
      };

      for (const repo of starredRepos) {
        try {
          let existing = await prisma.repository.findFirst({
            where: { externalId: String(repo.id) },
          });

          if (!existing) {
            const [owner, repoName] = repo.full_name.split('/');
            existing = await this.repositoryService.create(
              userId,
              {
                platform: Platform.GITHUB,
                owner,
                repo: repoName,
              },
              {
                userOAuthToken: user.githubAccessToken,
                accessMode: RepositoryAccessMode.MONITOR,
                accessLevel: RepositoryAccessLevel.READ,
                role: 'VIEWER',
                githubLogin: user.githubLogin ?? undefined,
                isStarred: true,
              },
            );
            starred++;
            this.logger.log(`Created starred repository: ${repo.full_name}`);
            trackStarredHistorySync(existing.id);
          } else {
            const userRepo = await prisma.userRepository.findUnique({
              where: {
                userId_repositoryId: {
                  userId,
                  repositoryId: existing.id,
                },
              },
            });

            if (!userRepo) {
              await prisma.userRepository.create({
                data: {
                  userId,
                  repositoryId: existing.id,
                  role: 'VIEWER',
                  accessMode: RepositoryAccessMode.MONITOR,
                  accessLevel: RepositoryAccessLevel.READ,
                  isStarred: true,
                },
              });
              this.logger.log(`Linked existing starred repository ${repo.full_name} to user`);
              trackStarredHistorySync(existing.id);
            } else if (userRepo.accessMode === RepositoryAccessMode.EDITABLE) {
              await prisma.userRepository.update({
                where: {
                  userId_repositoryId: {
                    userId,
                    repositoryId: existing.id,
                  },
                },
                data: {
                  isStarred: true,
                },
              });
              trackStarredHistorySync(existing.id);
            } else {
              await prisma.userRepository.update({
                where: {
                  userId_repositoryId: {
                    userId,
                    repositoryId: existing.id,
                  },
                },
                data: {
                  role: 'VIEWER',
                  accessMode: RepositoryAccessMode.MONITOR,
                  accessLevel: RepositoryAccessLevel.READ,
                  isStarred: true,
                },
              });
              trackStarredHistorySync(existing.id);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to sync starred repository ${repo.full_name}`, error);
        }
      }

      if (shouldReconcileStarredState) {
        await prisma.userRepository.updateMany({
          where: {
            userId,
            isStarred: true,
            repository: {
              platform: Platform.GITHUB,
              externalId: { notIn: starredExternalIds },
            },
          },
          data: { isStarred: false },
        });
      }

      this.logger.log(`Sync completed: ${synced} new repos, ${starred} new starred repos`);

      setTimeout(() => {
        if (monitoredRepositoryIdSet.size > 0) {
          this.syncAllUserRepositoriesHistory(userId, Array.from(monitoredStarredRepositoryIds)).catch((err) => {
            this.logger.error(`Failed to sync repository history for user ${userId}`, err);
          });
        }
        this.branchSyncService.syncBranchesForUser(userId).catch((err) => {
          this.logger.error(`Failed to sync branches for user ${userId}`, err);
        });
      }, 500);

      return { synced, starred };
    } catch (error) {
      this.logger.error(`Failed to sync user repositories`, error);
      // throwOnFetchError：调用方（如 token 保存接口）需要把同步失败如实上报，而不是伪装成 0 个成功
      if (options?.throwOnFetchError) {
        throw error;
      }
      return { synced: 0, starred: 0 };
    }
  }

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
              branch: repository.defaultBranch,
              branches: [repository.defaultBranch],
              occurredAt: new Date(commit.commit?.author?.date || new Date()),
              metadata: {
                source: 'legacy_history_sync',
                provider: 'github',
              },
            },
          });
          commits++;
        }
      }

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
              branch: pr.base?.ref,
              sourceBranch: pr.head?.ref,
              targetBranch: pr.base?.ref,
              branches: [pr.head?.ref, pr.base?.ref].filter(
                (branch): branch is string => Boolean(branch),
              ),
              occurredAt: new Date(
                pr.merged_at || (pr.state === 'closed' ? pr.closed_at : null) || pr.created_at,
              ),
              metadata: {
                source: 'legacy_history_sync',
                provider: 'github',
              },
            },
          });
          prs++;
        }
      }

      const issueData = await this.githubService.getIssues(
        owner,
        repo,
        'all',
        user.githubAccessToken,
      );

      for (const issue of issueData as any[]) {
        if (issue.pull_request) continue;

        const existingEvent = await prisma.event.findFirst({
          where: {
            repositoryId,
            externalId: String(issue.id),
          },
        });

        if (!existingEvent) {
          const eventType =
            issue.state === 'closed' ? EventType.ISSUE_CLOSED : EventType.ISSUE_OPENED;
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
              branches: [],
              occurredAt: new Date(
                issue.state === 'closed'
                  ? issue.closed_at || issue.updated_at || issue.created_at
                  : issue.created_at,
              ),
              metadata: {
                source: 'legacy_history_sync',
                provider: 'github',
              },
            },
          });
          issues++;
        }
      }

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

  async syncAllUserRepositoriesHistory(
    userId: string,
    priorityRepositoryIds: string[] = [],
  ): Promise<void> {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    const requestedRepositoryIds = Array.from(
      new Set([...priorityRepositoryIds, ...monitoredRepositoryIds]),
    );

    if (requestedRepositoryIds.length === 0) {
      return;
    }

    const repositories = await prisma.repository.findMany({
      where: {
        id: { in: requestedRepositoryIds },
        users: { some: { userId } },
      },
      select: { id: true },
    });

    const accessibleRepositoryIds = new Set(repositories.map((repository) => repository.id));
    const repositoryIds = requestedRepositoryIds.filter((repositoryId) =>
      accessibleRepositoryIds.has(repositoryId),
    );

    for (const repositoryId of repositoryIds) {
      try {
        await this.syncRepositoryHistory(repositoryId);
      } catch (error) {
        this.logger.error(`Failed to sync history for repository ${repositoryId}`, error);
      }
    }
  }
}
