import { Injectable, Logger } from '@nestjs/common';
import { EventType, RepositoryAccessMode, prisma } from '@repo-pulse/database';
import { GithubService } from '../repository/services/github.service';
import { EventService } from '../event/event.service';

@Injectable()
export class BranchSyncService {
  private readonly logger = new Logger(BranchSyncService.name);

  constructor(
    private readonly githubService: GithubService,
    private readonly eventService: EventService,
  ) {}

  /**
   * 同步用户的分支对比和上游同步警告
   */
  async syncBranchesForUser(userId: string): Promise<void> {
    this.logger.log(`Starting branch sync for user ${userId}`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true, githubRefreshToken: true, githubLogin: true },
    });

    if (!user?.githubAccessToken) {
      this.logger.warn(`User ${userId} has no GitHub access token`);
      return;
    }

    // 查找该用户拥有的 EDITABLE 仓库
    const userRepos = await prisma.userRepository.findMany({
      where: {
        userId,
        accessMode: RepositoryAccessMode.EDITABLE,
      },
      include: {
        repository: true,
      },
    });

    this.logger.log(`Found ${userRepos.length} editable repositories to check for branch sync alerts`);

    for (const ur of userRepos) {
      const repository = ur.repository;
      const [owner, repoName] = repository.fullName.split('/');

      try {
        // 1. 从 GitHub 获取分支
        const branches = await this.githubService.getBranches(
          owner,
          repoName,
          user.githubAccessToken,
        );

        // 2. 从 GitHub 获取活跃 PR 列表（只读 open）
        const openPrs = (await this.githubService.getPullRequests(
          owner,
          repoName,
          'open',
          user.githubAccessToken,
        )) as any[];

        const defaultBranch = repository.defaultBranch || 'main';

        for (const branch of branches) {
          if (branch.name === defaultBranch) {
            continue;
          }

          // 比较默认分支与当前分支
          // base = defaultBranch, head = branch.name
          const compareData = await this.githubService.compareBranches(
            owner,
            repoName,
            defaultBranch,
            branch.name,
            user.githubAccessToken,
          );

          if (!compareData) {
            continue;
          }

          const { ahead_by, behind_by, commits } = compareData;

          // 3. Ahead 检查：如果领先且无活跃 PR，生成 BRANCH_SYNC_ALERT
          if (ahead_by > 0) {
            const hasPr = openPrs.some(
              (pr) => pr.head?.ref === branch.name && pr.base?.ref === defaultBranch,
            );

            if (!hasPr) {
              const lastCommitSha = branch.lastCommitSha || (commits && commits[0]?.sha);
              if (!lastCommitSha) continue;

              const existingAlert = await prisma.event.findFirst({
                where: {
                  repositoryId: repository.id,
                  type: EventType.BRANCH_SYNC_ALERT,
                  branch: branch.name,
                  externalId: `${branch.name}-${lastCommitSha}`,
                },
              });

              if (!existingAlert) {
                // 提取前 5 个 ahead commits 信息
                const aheadCommits = (commits || [])
                  .slice(0, 5)
                  .map((c: any) => ({
                    sha: c.sha,
                    message: c.commit?.message,
                    author: c.commit?.author?.name,
                    date: c.commit?.author?.date,
                  }));

                await this.eventService.create({
                  repositoryId: repository.id,
                  type: EventType.BRANCH_SYNC_ALERT,
                  action: 'ahead',
                  title: `分支 ${branch.name} 领先于 ${defaultBranch} 且未创建 PR`,
                  body: `分支 ${branch.name} 领先默认分支 ${defaultBranch} ${ahead_by} 个提交，且当前没有活跃的合并请求。建议合并或同步。`,
                  author: commits[commits.length - 1]?.commit?.author?.name || 'GitHub',
                  branch: branch.name,
                  externalId: `${branch.name}-${lastCommitSha}`,
                  metadata: {
                    aheadBy: ahead_by,
                    behindBy: behind_by,
                    defaultBranch,
                    lastCommitSha,
                    aheadCommits,
                  },
                });
                this.logger.log(`Created BRANCH_SYNC_ALERT for ${repository.fullName} branch ${branch.name}`);
              }
            }
          }
        }

        // 4. Fork 上游同步检查
        const repoDetails = await this.githubService.getRepository(
          owner,
          repoName,
          user.githubAccessToken,
        );

        if (repoDetails && repoDetails.fork && repoDetails.parent) {
          const upstreamFullName = repoDetails.parent.full_name;
          const upstreamDefaultBranch = repoDetails.parent.default_branch || 'main';
          const [upstreamOwner] = upstreamFullName.split('/');

          // 对比本地默认分支与上游默认分支
          // base = defaultBranch, head = upstreamOwner:upstreamDefaultBranch
          const compareUpstream = await this.githubService.compareBranches(
            owner,
            repoName,
            defaultBranch,
            `${upstreamOwner}:${upstreamDefaultBranch}`,
            user.githubAccessToken,
          );

          if (compareUpstream) {
            const { ahead_by, behind_by, commits } = compareUpstream;

            // head 是 upstream，head 领先 base，说明我们落后于上游
            if (ahead_by > 0) {
              const upstreamLastCommitSha = compareUpstream.commits?.[compareUpstream.commits.length - 1]?.sha || compareUpstream.base_commit?.sha;
              if (upstreamLastCommitSha) {
                const existingAlert = await prisma.event.findFirst({
                  where: {
                    repositoryId: repository.id,
                    type: EventType.UPSTREAM_SYNC_ALERT,
                    branch: defaultBranch,
                    externalId: `upstream-${upstreamLastCommitSha}`,
                  },
                });

                if (!existingAlert) {
                  const upstreamCommits = (commits || [])
                    .slice(0, 5)
                    .map((c: any) => ({
                      sha: c.sha,
                      message: c.commit?.message,
                      author: c.commit?.author?.name,
                      date: c.commit?.author?.date,
                    }));

                  await this.eventService.create({
                    repositoryId: repository.id,
                    type: EventType.UPSTREAM_SYNC_ALERT,
                    action: 'behind',
                    title: `本地默认分支落后于上游 ${upstreamFullName}`,
                    body: `本地 ${defaultBranch} 分支落后上游主分支 ${upstreamDefaultBranch} ${ahead_by} 个提交。建议同步上游代码。`,
                    author: 'Upstream',
                    branch: defaultBranch,
                    externalId: `upstream-${upstreamLastCommitSha}`,
                    metadata: {
                      behindBy: ahead_by, // 我们落后的数量即 upstream 领先我们的数量
                      aheadBy: behind_by,
                      upstreamRepository: upstreamFullName,
                      upstreamBranch: upstreamDefaultBranch,
                      upstreamLastCommitSha,
                      upstreamCommits,
                    },
                  });
                  this.logger.log(`Created UPSTREAM_SYNC_ALERT for ${repository.fullName}`);
                }
              }
            }
          }
        }
      } catch (err) {
        this.logger.error(`Error comparing branches for repository ${repository.fullName}`, err);
      }
    }
  }
}
