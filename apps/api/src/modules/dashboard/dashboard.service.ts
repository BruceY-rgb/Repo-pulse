import { Injectable, Logger } from '@nestjs/common';
import { prisma, EventType } from '@repo-pulse/database';
import {
  buildEventScopeWhere,
  normalizeRepositoryBranchScopes,
  parseRepositoryBranchScopesParam,
} from '../../common/utils/repository-branch-scope';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  private async resolveRepositoryIds(
    userId: string,
    repositoryIdsParam?: string,
  ): Promise<string[]> {
    const repositories = await prisma.repository.findMany({
      where: {
        users: { some: { userId } },
      },
      select: { id: true },
    });

    const accessibleRepositoryIds = repositories.map((repository: { id: string }) => repository.id);

    if (!repositoryIdsParam) {
      return accessibleRepositoryIds;
    }

    const requestedRepositoryIds = repositoryIdsParam
      .split(',')
      .map((repositoryId) => repositoryId.trim())
      .filter(Boolean);

    if (requestedRepositoryIds.length === 0) {
      return [];
    }

    const accessibleRepositoryIdSet = new Set(accessibleRepositoryIds);
    return requestedRepositoryIds.filter((repositoryId) => accessibleRepositoryIdSet.has(repositoryId));
  }

  /**
   * 获取概览统计数据
   */
  async getOverview(
    userId: string,
    repositoryIdsParam?: string,
    repositoryBranchScopesParam?: string,
  ) {
    const repositoryIds = await this.resolveRepositoryIds(userId, repositoryIdsParam);
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repositoryIds,
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );
    const eventScopeWhere = buildEventScopeWhere(repositoryIds, repositoryBranchScopes);

    if (repositoryIds.length === 0) {
      return {
        totalRepositories: 0,
        openPRs: 0,
        commitsToday: 0,
        openIssues: 0,
      };
    }

    // 统计 Open PRs
    const openPRs = await prisma.event.count({
      where: {
        ...eventScopeWhere,
        type: EventType.PR_OPENED,
      },
    });

    // 统计今日提交
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const commitsToday = await prisma.event.count({
      where: {
        ...eventScopeWhere,
        type: EventType.PUSH,
        createdAt: { gte: today },
      },
    });

    // 统计 Open Issues
    const openIssues = await prisma.event.count({
      where: {
        ...eventScopeWhere,
        type: EventType.ISSUE_OPENED,
      },
    });

    return {
      totalRepositories: repositoryIds.length,
      openPRs,
      commitsToday,
      openIssues,
    };
  }

  /**
   * 获取活动图表数据
   */
  async getActivity(
    userId: string,
    days: number = 7,
    repositoryIdsParam?: string,
    repositoryBranchScopesParam?: string,
  ) {
    const repositoryIds = await this.resolveRepositoryIds(userId, repositoryIdsParam);
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repositoryIds,
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );

    if (repositoryIds.length === 0) {
      // 返回空数据
      return Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        return {
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          commits: 0,
          prs: 0,
          issues: 0,
        };
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const events = await prisma.event.findMany({
      where: {
        ...buildEventScopeWhere(repositoryIds, repositoryBranchScopes),
        createdAt: { gte: startDate },
      },
      select: {
        type: true,
        createdAt: true,
      },
    });

    // 按日期分组
    const activityMap = new Map<string, { commits: number; prs: number; issues: number }>();

    // 初始化所有日期
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const key = date.toLocaleDateString('en-US', { weekday: 'short' });
      activityMap.set(key, { commits: 0, prs: 0, issues: 0 });
    }

    // 统计事件
    for (const event of events) {
      const key = event.createdAt.toLocaleDateString('en-US', { weekday: 'short' });
      const current = activityMap.get(key);
      if (current) {
        if (event.type === EventType.PUSH) {
          current.commits++;
        } else if (
          event.type === EventType.PR_OPENED ||
          event.type === EventType.PR_MERGED ||
          event.type === EventType.PR_CLOSED
        ) {
          current.prs++;
        } else if (
          event.type === EventType.ISSUE_OPENED ||
          event.type === EventType.ISSUE_CLOSED
        ) {
          current.issues++;
        }
      }
    }

    return Array.from(activityMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }

  /**
   * 获取最近活动
   */
  async getRecentActivity(
    userId: string,
    limit: number = 10,
    repositoryIdsParam?: string,
    repositoryBranchScopesParam?: string,
  ) {
    const repositories = await prisma.repository.findMany({
      where: {
        users: { some: { userId } },
      },
      select: { id: true, name: true, fullName: true },
    });

    const accessibleRepositoryIdSet = new Set(
      await this.resolveRepositoryIds(userId, repositoryIdsParam),
    );
    const repositoriesInScope = repositories.filter((repository) =>
      accessibleRepositoryIdSet.has(repository.id),
    );
    const repositoryIds = repositoriesInScope.map((repository) => repository.id);
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repositoryIds,
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );
    const repoMap = new Map(
      repositoriesInScope.map((repository) => [
        repository.id,
        repository.fullName || repository.name,
      ]),
    );

    if (repositoryIds.length === 0) {
      return [];
    }

    const events = await prisma.event.findMany({
      where: {
        ...buildEventScopeWhere(repositoryIds, repositoryBranchScopes),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        action: true,
        title: true,
        author: true,
        createdAt: true,
        repositoryId: true,
      },
    });

    return events.map((event: { id: string; type: string; action: string | null; title: string | null; author: string | null; repositoryId: string; createdAt: Date }) => ({
      id: event.id,
      type: event.type,
      action: event.action,
      title: event.title,
      author: event.author,
      repo: repoMap.get(event.repositoryId) || 'Unknown',
      time: this.getRelativeTime(event.createdAt),
    }));
  }

  /**
   * 计算相对时间
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  }
}
