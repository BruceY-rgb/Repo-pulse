import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { prisma, EventType, Prisma } from '@repo-pulse/database';
import {
  buildEventScopeWhere,
  normalizeRepositoryBranchScopes,
  parseRepositoryBranchScopesParam,
} from '../../common/utils/repository-branch-scope';
import {
  detectProjectRiverKeyNodes,
  ProjectRiverDailyRow,
  ProjectRiverKeyNode,
  ProjectRiverSeverity,
} from './project-river-detector';
import {
  calculateHealthStats,
  evaluateHealthRules,
  HealthSignal,
} from './health-rules';

type JsonRecord = Record<string, Prisma.JsonValue>;

type DashboardEventForAnalysis = {
  id: string;
  type: EventType;
  action: string;
  title: string;
  body: string | null;
  author: string;
  externalUrl: string | null;
  metadata: Prisma.JsonValue;
  rawPayload: Prisma.JsonValue | null;
  occurredAt: Date | null;
  createdAt: Date;
};

export interface ProjectRiverEventMarker {
  id: string;
  date: string;
  title: string;
  description: string;
  type: 'push' | 'pull_request' | 'issue' | 'release' | 'security' | 'other';
  severity: ProjectRiverSeverity;
  externalUrl: string | null;
  source: 'event';
}

export interface ProjectRiverDashboardPayload {
  repositoryId: string;
  generatedAt: string;
  source: 'event_store';
  dailyRows: ProjectRiverDailyRow[];
  keyNodes: ProjectRiverKeyNode[];
  eventMarkers: ProjectRiverEventMarker[];
  healthSignals: HealthSignal[];
  summary: {
    totalCommits: number;
    totalContributors: number;
    totalEvents: number;
    analyzedEvents: number;
    isTruncated: boolean;
    latestEventAt: string | null;
  };
  cache: {
    status: 'hit' | 'miss';
    ttlMs: number;
    expiresAt: string;
    fingerprint: string;
  };
}

const PROJECT_RIVER_CACHE_TTL_MS = 10 * 60 * 1000;
const PROJECT_RIVER_MAX_EVENTS = 10000;
const BOT_AUTHOR_KEYWORDS = ['system', 'agent', 'bot', 'ai analysis', 'feishu'];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getEventDate(event: DashboardEventForAnalysis): Date {
  return event.occurredAt ?? event.createdAt;
}

function isAutomationAuthor(author?: string | null): boolean {
  if (!author) {
    return true;
  }

  const normalized = author.toLowerCase();
  return BOT_AUTHOR_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function getEventClassifier(event: DashboardEventForAnalysis): string {
  return `${event.type} ${event.action}`.toLowerCase();
}

function isCommitEvent(event: DashboardEventForAnalysis): boolean {
  const classifier = getEventClassifier(event);
  return classifier.includes('push') || classifier.includes('commit');
}

function getRawCommits(event: DashboardEventForAnalysis): JsonRecord[] {
  const rawPayload = isRecord(event.rawPayload) ? event.rawPayload : {};
  const metadata = isRecord(event.metadata) ? event.metadata : {};
  const commits = Array.isArray(rawPayload.commits) ? rawPayload.commits : metadata.commits;

  return Array.isArray(commits)
    ? commits.filter((commit): commit is JsonRecord => isRecord(commit))
    : [];
}

function extractCommitCount(event: DashboardEventForAnalysis): number {
  const metadata = isRecord(event.metadata) ? event.metadata : {};
  const rawPayload = isRecord(event.rawPayload) ? event.rawPayload : {};
  const direct =
    readNumber(metadata.commitCount) ??
    readNumber(metadata.commitsCount) ??
    readNumber(metadata.commit_count) ??
    readNumber(rawPayload.total_commits_count) ??
    readNumber(rawPayload.commitCount);

  if (direct !== undefined && direct > 0) {
    return direct;
  }

  const rawCommitCount = getRawCommits(event).length;
  return rawCommitCount > 0 ? rawCommitCount : 1;
}

function countFilesFromCommit(commit: JsonRecord): number {
  const files = new Set<string>();
  for (const key of ['added', 'removed', 'modified']) {
    const value = commit[key];
    if (!Array.isArray(value)) {
      continue;
    }
    value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .forEach((item) => files.add(item));
  }

  const direct =
    readNumber(commit.filesTouched) ??
    readNumber(commit.changedFiles) ??
    readNumber(commit.files_changed);

  return Math.max(files.size, direct ?? 0);
}

function extractFilesTouched(event: DashboardEventForAnalysis): number {
  const metadata = isRecord(event.metadata) ? event.metadata : {};
  const direct =
    readNumber(metadata.filesTouched) ??
    readNumber(metadata.changedFiles) ??
    readNumber(metadata.files_changed);

  if (direct !== undefined) {
    return direct;
  }

  return getRawCommits(event).reduce((sum, commit) => sum + countFilesFromCommit(commit), 0);
}

function extractCommitLineStats(commit: JsonRecord): { added: number; deleted: number } {
  const stats = isRecord(commit.stats) ? commit.stats : {};
  return {
    added:
      readNumber(commit.additions) ??
      readNumber(commit.linesAdded) ??
      readNumber(stats.additions) ??
      0,
    deleted:
      readNumber(commit.deletions) ??
      readNumber(commit.linesDeleted) ??
      readNumber(stats.deletions) ??
      0,
  };
}

function extractEventLineStats(event: DashboardEventForAnalysis): { added: number; deleted: number } {
  const metadata = isRecord(event.metadata) ? event.metadata : {};
  return {
    added:
      readNumber(metadata.linesAdded) ??
      readNumber(metadata.additions) ??
      readNumber(metadata.addedLines) ??
      0,
    deleted:
      readNumber(metadata.linesDeleted) ??
      readNumber(metadata.deletions) ??
      readNumber(metadata.deletedLines) ??
      0,
  };
}

function getCommitAuthor(commit: JsonRecord, fallbackAuthor: string): string {
  const author = isRecord(commit.author) ? commit.author : {};
  const committer = isRecord(commit.committer) ? commit.committer : {};
  return (
    readString(author.name) ??
    readString(author.username) ??
    readString(author.email) ??
    readString(committer.name) ??
    fallbackAuthor
  );
}

function getCommitDate(commit: JsonRecord, fallbackDate: Date): Date {
  const author = isRecord(commit.author) ? commit.author : {};
  const rawDate =
    readString(commit.timestamp) ??
    readString(commit.date) ??
    readString(author.date);
  const date = rawDate ? new Date(rawDate) : fallbackDate;
  return Number.isNaN(date.getTime()) ? fallbackDate : date;
}

function getDisplayEventType(
  event: DashboardEventForAnalysis,
): ProjectRiverEventMarker['type'] {
  const normalized = event.type.toLowerCase();
  if (normalized.includes('pull') || normalized.includes('pr_')) return 'pull_request';
  if (normalized.includes('issue')) return 'issue';
  if (normalized.includes('release')) return 'release';
  if (normalized.includes('security')) return 'security';
  if (normalized.includes('push') || normalized.includes('commit')) return 'push';
  return 'other';
}

function getEventSeverity(event: DashboardEventForAnalysis): ProjectRiverSeverity {
  const classifier = getEventClassifier(event);
  if (classifier.includes('release') || classifier.includes('merged') || classifier.includes('approval')) {
    return 'positive';
  }
  if (classifier.includes('security') || classifier.includes('failed') || classifier.includes('risk')) {
    return 'warning';
  }
  return 'info';
}

function buildDailyRows(events: DashboardEventForAnalysis[]): ProjectRiverDailyRow[] {
  const bucket = new Map<string, ProjectRiverDailyRow>();

  const addRow = (row: ProjectRiverDailyRow) => {
    const key = `${row.date}:${row.contributor}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.commits += row.commits;
      existing.linesAdded += row.linesAdded;
      existing.linesDeleted += row.linesDeleted;
      existing.filesTouched += row.filesTouched;
      return;
    }
    bucket.set(key, row);
  };

  for (const event of events) {
    if (!isCommitEvent(event)) {
      continue;
    }

    const eventDate = getEventDate(event);
    const rawCommits = getRawCommits(event);
    if (rawCommits.length > 0) {
      for (const commit of rawCommits) {
        const contributor = getCommitAuthor(commit, event.author);
        if (isAutomationAuthor(contributor)) {
          continue;
        }
        const lineStats = extractCommitLineStats(commit);
        addRow({
          date: toIsoDate(getCommitDate(commit, eventDate)),
          contributor,
          commits: 1,
          linesAdded: lineStats.added,
          linesDeleted: lineStats.deleted,
          filesTouched: countFilesFromCommit(commit),
          cumulativeCommits: 0,
        });
      }
      continue;
    }

    if (isAutomationAuthor(event.author)) {
      continue;
    }

    const lineStats = extractEventLineStats(event);
    addRow({
      date: toIsoDate(eventDate),
      contributor: event.author || 'Unknown',
      commits: extractCommitCount(event),
      linesAdded: lineStats.added,
      linesDeleted: lineStats.deleted,
      filesTouched: extractFilesTouched(event),
      cumulativeCommits: 0,
    });
  }

  const rows = Array.from(bucket.values()).sort((left, right) =>
    left.date.localeCompare(right.date) || left.contributor.localeCompare(right.contributor),
  );
  const cumulativeByContributor = new Map<string, number>();

  return rows.map((row) => {
    const cumulative = (cumulativeByContributor.get(row.contributor) ?? 0) + row.commits;
    cumulativeByContributor.set(row.contributor, cumulative);
    return { ...row, cumulativeCommits: cumulative };
  });
}

function buildEventMarkers(events: DashboardEventForAnalysis[]): ProjectRiverEventMarker[] {
  return events
    .map((event) => ({
      id: event.id,
      date: toIsoDate(getEventDate(event)),
      title: event.title,
      description: event.body || event.action || event.type,
      type: getDisplayEventType(event),
      severity: getEventSeverity(event),
      externalUrl: event.externalUrl,
      source: 'event' as const,
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private readonly projectRiverCache = new Map<
    string,
    { data: ProjectRiverDashboardPayload; expiresAt: number }
  >();

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
        occurredAt: { gte: today },
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
        occurredAt: { gte: startDate },
      },
      select: {
        type: true,
        occurredAt: true,
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
      if (!event.occurredAt) {
        continue;
      }

      const key = event.occurredAt.toLocaleDateString('en-US', { weekday: 'short' });
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
      orderBy: { occurredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        action: true,
        title: true,
        author: true,
        occurredAt: true,
        repositoryId: true,
        branch: true,
        sourceBranch: true,
        targetBranch: true,
        branches: true,
      },
    });

    return events.map((event: {
      id: string;
      type: string;
      action: string | null;
      title: string | null;
      author: string | null;
      repositoryId: string;
      occurredAt: Date | null;
      branch: string | null;
      sourceBranch: string | null;
      targetBranch: string | null;
      branches: string[];
    }) => ({
      id: event.id,
      type: event.type,
      action: event.action,
      title: event.title,
      author: event.author,
      repo: repoMap.get(event.repositoryId) || 'Unknown',
      branch: event.branch,
      sourceBranch: event.sourceBranch,
      targetBranch: event.targetBranch,
      branches: event.branches,
      occurredAt: event.occurredAt?.toISOString() ?? null,
      time: this.getRelativeTime(event.occurredAt ?? new Date()),
    }));
  }

  /**
   * Project-river style repository dashboard data.
   *
   * The chart should consume repository analysis data, not chat message state.
   * This endpoint builds a stable daily contributor table from persisted Git events,
   * runs project-river's deterministic key-node detection, and caches the result
   * by repository scope plus latest-event fingerprint.
   */
  async getProjectRiverRepositoryDashboard(
    userId: string,
    repositoryIdParam: string,
    repositoryBranchScopesParam?: string,
  ): Promise<ProjectRiverDashboardPayload> {
    const repositoryIds = await this.resolveRepositoryIds(userId, repositoryIdParam);
    const repositoryId = repositoryIds[0];

    if (!repositoryId) {
      throw new NotFoundException('Repository not found');
    }

    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      [repositoryId],
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );
    const eventScopeWhere = buildEventScopeWhere([repositoryId], repositoryBranchScopes);

    const [repository, totalEventCount, latestEvent] = await Promise.all([
      prisma.repository.findFirst({
        where: {
          id: repositoryId,
          users: { some: { userId } },
        },
        select: {
          id: true,
          lastSyncAt: true,
        },
      }),
      prisma.event.count({ where: eventScopeWhere }),
      prisma.event.findFirst({
        where: eventScopeWhere,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          occurredAt: true,
        },
      }),
    ]);

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    const fingerprint = JSON.stringify({
      repositoryId,
      branchScopes: repositoryBranchScopes,
      totalEventCount,
      latestEventId: latestEvent?.id ?? null,
      latestEventCreatedAt: latestEvent?.createdAt.toISOString() ?? null,
      lastSyncAt: repository.lastSyncAt?.toISOString() ?? null,
    });
    const cacheKey = `project-river:${fingerprint}`;
    const now = Date.now();
    const cached = this.projectRiverCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return {
        ...cached.data,
        cache: {
          ...cached.data.cache,
          status: 'hit',
          expiresAt: new Date(cached.expiresAt).toISOString(),
        },
      };
    }

    const events = await prisma.event.findMany({
      where: eventScopeWhere,
      orderBy: [
        { occurredAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: PROJECT_RIVER_MAX_EVENTS,
      select: {
        id: true,
        type: true,
        action: true,
        title: true,
        body: true,
        author: true,
        externalUrl: true,
        metadata: true,
        rawPayload: true,
        occurredAt: true,
        createdAt: true,
      },
    });
    const dailyRows = buildDailyRows(events);
    const totalCommits = dailyRows.reduce((sum, row) => sum + row.commits, 0);
    const keyNodes = detectProjectRiverKeyNodes(dailyRows, {
      firstCommitThreshold: Math.max(2, Math.min(20, Math.ceil(totalCommits * 0.03))),
      commitMilestones: [10, 50, 100, 500, 1000, 5000, 10000],
      minDataDaysForMutation: 7,
    });

    const healthStats = calculateHealthStats(dailyRows);
    const healthSignals = evaluateHealthRules(healthStats);

    const expiresAt = now + PROJECT_RIVER_CACHE_TTL_MS;
    const payload: ProjectRiverDashboardPayload = {
      repositoryId,
      generatedAt: new Date(now).toISOString(),
      source: 'event_store',
      dailyRows,
      keyNodes,
      eventMarkers: buildEventMarkers(events),
      healthSignals,
      summary: {
        totalCommits,
        totalContributors: new Set(dailyRows.map((row) => row.contributor)).size,
        totalEvents: totalEventCount,
        analyzedEvents: events.length,
        isTruncated: totalEventCount > events.length,
        latestEventAt: latestEvent
          ? (latestEvent.occurredAt ?? latestEvent.createdAt).toISOString()
          : null,
      },
      cache: {
        status: 'miss',
        ttlMs: PROJECT_RIVER_CACHE_TTL_MS,
        expiresAt: new Date(expiresAt).toISOString(),
        fingerprint,
      },
    };

    this.projectRiverCache.set(cacheKey, { data: payload, expiresAt });
    this.pruneProjectRiverCache();
    return payload;
  }

  private pruneProjectRiverCache(): void {
    if (this.projectRiverCache.size <= 120) {
      return;
    }

    const now = Date.now();
    for (const [key, value] of this.projectRiverCache) {
      if (value.expiresAt <= now) {
        this.projectRiverCache.delete(key);
      }
    }

    while (this.projectRiverCache.size > 100) {
      const oldestKey = this.projectRiverCache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.projectRiverCache.delete(oldestKey);
    }
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
