import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PrismaClient,
  EventType,
  Prisma,
  Event,
  NotificationChannel,
  FilterAction,
  RepositoryAccessMode,
  RiskLevel,
} from '@repo-pulse/database';
import { PaginationQueryDto } from './dto/event.dto';
import { EventGateway } from './event.gateway';
import { AIService } from '../ai/ai.service';
import { FilterService } from '../filter/filter.service';
import { NotificationService, NotificationPreferences } from '../notification/notification.service';
import { SendNotificationDto } from '../notification/dto/notification.dto';
import { ImService } from '../im/im.service';
import {
  buildEventScopeWhere,
  normalizeRepositoryBranchScopes,
  parseRepositoryBranchScopesParam,
} from '../../common/utils/repository-branch-scope';
import { readBooleanEnv, readCsvEnv } from '../../common/utils/env-flags';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private prisma: PrismaClient;

  constructor(
    private readonly eventGateway: EventGateway,
    private readonly aiService: AIService,
    private readonly filterService: FilterService,
    private readonly notificationService: NotificationService,
    private readonly imService: ImService,
  ) {
    this.prisma = new PrismaClient();
  }

  private async resolveRepositoryIds(
    userId: string,
    repositoryId?: string,
    repositoryIdsParam?: string,
  ): Promise<string[]> {
    const userRepos = await this.prisma.userRepository.findMany({
      where: { userId },
      select: { repositoryId: true },
    });

    const accessibleRepositoryIds = userRepos.map(
      (repository: { repositoryId: string }) => repository.repositoryId,
    );

    const requestedRepositoryIds = repositoryIdsParam
      ? repositoryIdsParam
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : repositoryId
        ? [repositoryId]
        : [];

    if (requestedRepositoryIds.length === 0) {
      return accessibleRepositoryIds;
    }

    const accessibleRepositoryIdSet = new Set(accessibleRepositoryIds);
    return requestedRepositoryIds.filter((value) => accessibleRepositoryIdSet.has(value));
  }

  async create(
    data: {
      repositoryId: string;
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
      metadata?: Record<string, unknown>;
      rawPayload?: Record<string, unknown>;
      occurredAt?: Date;
    },
    options?: {
      broadcast?: boolean;
      notify?: boolean;
      analyze?: boolean;
    },
  ): Promise<Event> {
    const branches = this.resolveBranches(data.branches, [
      data.branch,
      data.sourceBranch,
      data.targetBranch,
    ]);

    const event = await this.prisma.event.create({
      data: {
        repositoryId: data.repositoryId,
        type: data.type,
        action: data.action,
        title: data.title,
        body: data.body,
        author: data.author,
        authorAvatar: data.authorAvatar,
        externalId: data.externalId,
        externalUrl: data.externalUrl,
        branch: data.branch,
        sourceBranch: data.sourceBranch,
        targetBranch: data.targetBranch,
        branches,
        metadata: (data.metadata || {}) as Prisma.InputJsonValue,
        rawPayload: data.rawPayload as Prisma.InputJsonValue,
        occurredAt: data.occurredAt,
      },
    });

    this.logger.log(
      `event_created eventId=${event.id} repositoryId=${data.repositoryId} type=${data.type}`,
    );

    this.runPostCreateTasks(event, options).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(
        `event_post_create_failed eventId=${event.id} repositoryId=${data.repositoryId} reason=${message}`,
      );
    });

    return event;
  }

  private resolveBranches(explicitBranches: string[] | undefined, fallbackBranches: Array<string | undefined>): string[] {
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

  private async runPostCreateTasks(
    event: Event,
    options?: {
      broadcast?: boolean;
      notify?: boolean;
      analyze?: boolean;
    },
  ): Promise<void> {
    if (options?.broadcast !== false) {
      this.broadcastEvent(event.repositoryId, event);
    }
    if (options?.notify !== false) {
      await this.notifyRepositoryUsers(event); // 首次通知，有 riskLevel 规则的用户延迟
    }
    if (options?.analyze !== false) {
      await this.enqueueAnalysis(event.id);
    }
  }

  /**
   * AI 分析完成后重新通知仓库用户（riskLevel 此时可用）。
   * 只通知有 riskLevel 规则的用户（他们之前被延迟了），
   * 无风险规则的用户早已收到通知，跳过避免重复。
   * 由 AIProcessor 调用。
   */
  async retryNotificationsAfterAnalysis(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      this.logger.warn(`retryNotifications: event not found ${eventId}`);
      return;
    }
    await this.notifyRepositoryUsers(event, { onlyWithRiskRule: true });
  }

  private async notifyRepositoryUsers(
    event: Event,
    options?: { onlyWithRiskRule?: boolean },
  ): Promise<void> {
    const repository = await this.prisma.repository.findUnique({
      where: { id: event.repositoryId },
      select: { fullName: true },
    });

    const userRepositories = await this.prisma.userRepository.findMany({
      where: { repositoryId: event.repositoryId },
    });

    // 查询现有 AI 分析结果（如有），用于 riskLevel 过滤
    const existingAnalysis = await this.prisma.aIAnalysis.findFirst({
      where: { eventId: event.id, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { riskLevel: true },
    });

    // 获取所有用户偏好，检查监控范围
    const allUserIds = userRepositories.map((e) => e.userId);
    const usersWithPrefs = allUserIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: allUserIds } },
          select: { id: true, preferences: true },
        })
      : [];
    const userScopeMap = new Map<string, string[]>();
    for (const u of usersWithPrefs) {
      const prefs = (u.preferences as Record<string, unknown>) || {};
      const scope = (prefs.monitoringScope as Record<string, unknown>) || {};
      const ids = Array.isArray(scope.repositoryIds) ? scope.repositoryIds as string[] : [];
      userScopeMap.set(u.id, ids);
    }

    for (const entry of userRepositories) {
      // Empty repository scope means all accessible repositories are monitored.
      const scopeIds = userScopeMap.get(entry.userId) || [];
      if (scopeIds.length > 0 && !scopeIds.includes(event.repositoryId)) {
        continue;
      }
      const userId = entry.userId;
      try {
        const hasRiskRule = await this.filterService.hasRuleReferencingField(userId, 'riskLevel');

        // 重试模式：只通知有 riskLevel 规则的用户，跳过其他（避免重复）
        if (options?.onlyWithRiskRule && !hasRiskRule) {
          continue;
        }

        // 首次模式：有 riskLevel 规则但分析未完成 → 延迟通知
        if (hasRiskRule && !existingAnalysis && !options?.onlyWithRiskRule) {
          this.logger.log(`notification_deferred eventId=${event.id} userId=${userId} reason=risk_based_rule_waiting_for_analysis`);
          continue;
        }

        const filterResult = await this.filterService.applyRules(userId, {
          type: event.type,
          repository: repository?.fullName || event.repositoryId,
          author: event.author,
          body: event.body || undefined,
          riskLevel: existingAnalysis?.riskLevel as string | undefined,
        });

        if (filterResult.action === FilterAction.EXCLUDE) {
          this.logger.log(
            `event_filtered eventId=${event.id} userId=${userId} ruleId=${filterResult.matchedRule?.id || 'none'}`,
          );
          continue;
        }

        const preferences = await this.notificationService.getPreferences(userId);

        // 通知焦点级别过滤
        if (preferences.focusLevel === 'focused' && !this.isHighSignalEvent(event, existingAnalysis)) {
          this.logger.log(`notification_skipped_focus_level eventId=${event.id} userId=${userId} focusLevel=focused`);
          continue;
        }
        if (
          preferences.focusLevel === 'important' &&
          !this.isImportantSignalEvent(event, existingAnalysis)
        ) {
          this.logger.log(`notification_skipped_focus_level eventId=${event.id} userId=${userId} focusLevel=important`);
          continue;
        }

        const channels = this.resolveChannelsForEvent(event, preferences);

        await this.sendImRepositoryEventNotification(userId, event, repository?.fullName);

        for (const channel of channels) {
          const dto: SendNotificationDto = {
            userId,
            eventId: event.id,
            channel,
            title: event.title,
            content: event.body || event.title,
            metadata: {
              repositoryId: event.repositoryId,
              eventType: event.type,
              source: 'event_pipeline',
            },
          };
          await this.notificationService.send(dto);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.error(
          `notification_failed eventId=${event.id} userId=${userId} stage=notify_repository_users reason=${message}`,
        );
      }
    }
  }

  private async sendImRepositoryEventNotification(
    userId: string,
    event: Event,
    repositoryName?: string,
  ): Promise<void> {
    try {
      const result = await this.imService.sendRepositoryEventNotification(userId, {
        eventId: event.id,
        repositoryId: event.repositoryId,
        repositoryName: repositoryName || event.repositoryId,
        eventType: event.type,
        title: event.title,
        content: event.body || event.title,
        author: event.author,
        externalUrl: event.externalUrl || undefined,
        branch: event.branch || undefined,
        sourceBranch: event.sourceBranch || undefined,
        targetBranch: event.targetBranch || undefined,
      });

      if (result.sent > 0) {
        this.logger.log(
          `feishu_event_notification_sent eventId=${event.id} userId=${userId} count=${result.sent}`,
        );
      } else if (result.skippedReason) {
        this.logger.log(
          `feishu_event_notification_skipped eventId=${event.id} userId=${userId} reason=${result.skippedReason}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(
        `feishu_event_notification_failed eventId=${event.id} userId=${userId} reason=${message}`,
      );
    }
  }

  /**
   * 根据事件类型和用户偏好决定启用哪些通知渠道。
   *
   * 偏好映射（优先级从高到低）：
   * - prUpdates=false → 跳过所有 PR 相关事件
   * - 没有匹配的偏好但渠道列表非空 → 默认发送
   */
  private resolveChannelsForEvent(
    event: Event,
    preferences: NotificationPreferences,
  ): NotificationChannel[] {
    // PR 偏好：影响所有 PR 相关事件类型
    if (this.isPullRequestEvent(event.type)) {
      if (preferences.events.prUpdates === false) {
        return [];
      }
    }

    // 不在此处检查 highRisk / analysisComplete，它们在 AI 分析完成后
    // 由 AIProcessor.notifyApprovalCreated() 单独处理

    return preferences.channels;
  }

  /**
   * 「仅高信号」模式：只保留高风险事件和 PR 操作
   */
  private isHighSignalEvent(
    event: { type: EventType },
    analysis?: { riskLevel: string } | null,
  ): boolean {
    if (this.isPullRequestEvent(event.type)) return true;
    const risk = analysis?.riskLevel as string | undefined;
    return risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL;
  }

  /**
   * 「重要更新」模式：过滤掉低风险/日常 push
   */
  private isImportantSignalEvent(
    event: { type: EventType },
    analysis?: { riskLevel: string } | null,
  ): boolean {
    if (this.isPullRequestEvent(event.type)) return true;
    const risk = analysis?.riskLevel as string | undefined;
    if (risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL) return true;
    if (risk === RiskLevel.MEDIUM) return true;
    // 无分析结果时不拦截（分析可能尚未完成）
    if (!risk) return true;
    return false;
  }

  private async enqueueAnalysis(eventId: string): Promise<void> {
    // 系统级 AI 分析开关
    const enabled = readBooleanEnv('AI_ANALYSIS_ENABLED', true);
    if (!enabled) {
      this.logger.log(`ai_skipped eventId=${eventId} reason=system_disabled`);
      return;
    }

    // 自动分析必须显式开启，避免 webhook / 同步事件持续消耗模型额度。
    const autoEnabled = readBooleanEnv('AI_AUTO_ANALYSIS_ENABLED', false);
    if (!autoEnabled) {
      this.logger.log(`ai_skipped eventId=${eventId} reason=auto_disabled`);
      return;
    }

    // MVP 事件类型白名单
    const MVP_TYPES: EventType[] = [EventType.PUSH, EventType.PR_OPENED, EventType.ISSUE_OPENED];
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { type: true, repositoryId: true },
    });

    if (!event || !MVP_TYPES.includes(event.type)) {
      this.logger.log(
        `ai_skipped eventId=${eventId} reason=unsupported_event_type type=${event?.type ?? 'unknown'}`,
      );
      return;
    }

    const autoAccessModes = this.resolveAutoAnalysisAccessModes();
    if (autoAccessModes.length === 0) {
      this.logger.log(`ai_skipped eventId=${eventId} reason=auto_no_allowed_access_modes`);
      return;
    }

    // 检查仓库是否有允许自动分析的用户关联，并且在这些用户的监控范围内。
    const repoUsers = await this.prisma.userRepository.findMany({
      where: {
        repositoryId: event.repositoryId,
        accessMode: { in: autoAccessModes },
      },
      select: { userId: true },
    });
    const userIds = repoUsers.map((r) => r.userId);
    if (userIds.length === 0) {
      this.logger.log(`ai_skipped eventId=${eventId} reason=auto_no_eligible_repository_user`);
      return;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { preferences: true },
    });
    const anyInScope = users.some((u) => {
      const prefs = (u.preferences as Record<string, unknown>) || {};
      const scope = (prefs.monitoringScope as Record<string, unknown>) || {};
      const ids = Array.isArray(scope.repositoryIds) ? scope.repositoryIds : [];
      return ids.length === 0 || ids.includes(event.repositoryId);
    });
    if (!anyInScope) {
      this.logger.log(`ai_skipped eventId=${eventId} reason=not_in_monitoring_scope`);
      return;
    }

    try {
      await this.aiService.triggerAnalysis(eventId, false, { source: 'auto' });
      this.logger.log(`ai_enqueued eventId=${eventId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(`ai_enqueue_failed eventId=${eventId} reason=${message}`);
    }
  }

  private resolveAutoAnalysisAccessModes(): RepositoryAccessMode[] {
    const allowed = new Set<string>(Object.values(RepositoryAccessMode));

    return readCsvEnv('AI_AUTO_ANALYSIS_ACCESS_MODES', [RepositoryAccessMode.EDITABLE])
      .map((mode) => mode.toUpperCase())
      .filter((mode): mode is RepositoryAccessMode => allowed.has(mode));
  }

  private isPullRequestEvent(type: EventType): boolean {
    return ([
      EventType.PR_OPENED,
      EventType.PR_MERGED,
      EventType.PR_CLOSED,
      EventType.PR_REVIEW,
    ] as EventType[]).includes(type);
  }

  private broadcastEvent(repositoryId: string, event: Event) {
    try {
      this.eventGateway.broadcastEventCreated({
        eventId: event.id,
        repositoryId,
        eventType: event.type,
        seq: Number(event.seq),
        createdAt: event.createdAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`event_broadcast_failed eventId=${event.id} reason=${message}`);
    }
  }

  async findAll(userId: string, query: PaginationQueryDto): Promise<any> {
    const { page = 1, pageSize = 20, sortBy = 'occurredAt', sortOrder = 'desc' } = query;
    const safeSortBy = ['occurredAt', 'createdAt', 'type', 'title', 'author'].includes(sortBy)
      ? sortBy
      : 'occurredAt';
    const repositoryIds = await this.resolveRepositoryIds(
      userId,
      query.repositoryId,
      query.repositoryIds,
    );
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repositoryIds,
      parseRepositoryBranchScopesParam(query.branchScopes),
    );

    if (repositoryIds.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const where = buildEventScopeWhere(repositoryIds, repositoryBranchScopes);

    const [items, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: {
          [safeSortBy]: sortOrder,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          repository: {
            select: {
              id: true,
              name: true,
              fullName: true,
              platform: true,
            },
          },
          _count: {
            select: {
              analyses: true,
              approvals: true,
            },
          },
        },
      }),
      this.prisma.event.count({
        where,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: string): Promise<any> {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        repository: {
          select: {
            id: true,
            name: true,
            fullName: true,
            platform: true,
            url: true,
          },
        },
        analyses: true,
        approvals: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async findByExternalId(repositoryId: string, externalId: string): Promise<Event | null> {
    return this.prisma.event.findFirst({
      where: {
        repositoryId,
        externalId,
      },
    });
  }

  async getEventStats(
    userId: string,
    repositoryId?: string,
    repositoryIdsParam?: string,
    repositoryBranchScopesParam?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const repositoryIds = await this.resolveRepositoryIds(userId, repositoryId, repositoryIdsParam);
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      repositoryIds,
      parseRepositoryBranchScopesParam(repositoryBranchScopesParam),
    );

    if (repositoryIds.length === 0) {
      return {
        total: 0,
        byType: [],
      };
    }

    const where: Prisma.EventWhereInput = buildEventScopeWhere(
      repositoryIds,
      repositoryBranchScopes,
    );

    if (dateFrom || dateTo) {
      where.occurredAt = {};
      if (dateFrom) {
        (where.occurredAt as Record<string, Date>).gte = dateFrom;
      }
      if (dateTo) {
        (where.occurredAt as Record<string, Date>).lte = dateTo;
      }
    }

    const [total, byType] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byType: byType.map((item: { type: string; _count: number }) => ({
        type: item.type,
        count: item._count,
      })),
    };
  }

  async deleteOldEvents(repositoryId: string, days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.prisma.event.deleteMany({
      where: {
        repositoryId,
        occurredAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(`Deleted ${result.count} old events for repository ${repositoryId}`);
    return result;
  }
}
