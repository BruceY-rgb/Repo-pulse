import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient, EventType, Prisma, Event, NotificationChannel, FilterAction } from '@repo-pulse/database';
import { PaginationQueryDto } from './dto/event.dto';
import { EventGateway } from './event.gateway';
import { AIService } from '../ai/ai.service';
import { FilterService } from '../filter/filter.service';
import { NotificationService, NotificationPreferences } from '../notification/notification.service';
import { SendNotificationDto } from '../notification/dto/notification.dto';

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);
  private prisma: PrismaClient;

  constructor(
    private readonly eventGateway: EventGateway,
    private readonly aiService: AIService,
    private readonly filterService: FilterService,
    private readonly notificationService: NotificationService,
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

  async create(data: {
    repositoryId: string;
    type: EventType;
    action: string;
    title: string;
    body?: string;
    author: string;
    authorAvatar?: string;
    externalId: string;
    externalUrl?: string;
    metadata?: Record<string, unknown>;
    rawPayload?: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<Event> {
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
        metadata: (data.metadata || {}) as Prisma.InputJsonValue,
        rawPayload: data.rawPayload as Prisma.InputJsonValue,
        occurredAt: data.occurredAt,
      },
    });

    this.logger.log(
      `event_created eventId=${event.id} repositoryId=${data.repositoryId} type=${data.type}`,
    );

    this.runPostCreateTasks(event).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(
        `event_post_create_failed eventId=${event.id} repositoryId=${data.repositoryId} reason=${message}`,
      );
    });

    return event;
  }

  private async runPostCreateTasks(event: Event): Promise<void> {
    this.broadcastEvent(event.repositoryId, event);
    await this.notifyRepositoryUsers(event); // 首次通知，有 riskLevel 规则的用户延迟
    await this.enqueueAnalysis(event.id);
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

    for (const entry of userRepositories) {
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
        const channels = this.resolveChannelsForEvent(event, preferences);
        if (channels.length === 0) {
          continue;
        }

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

  private async enqueueAnalysis(eventId: string): Promise<void> {
    // 系统级 AI 分析开关
    const enabled = process.env.AI_ANALYSIS_ENABLED !== 'false';
    if (!enabled) {
      this.logger.log(`ai_skipped eventId=${eventId} reason=system_disabled`);
      return;
    }

    // MVP 事件类型白名单
    const MVP_TYPES: EventType[] = [EventType.PUSH, EventType.PR_OPENED, EventType.ISSUE_OPENED];
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { type: true },
    });

    if (!event || !MVP_TYPES.includes(event.type)) {
      this.logger.log(
        `ai_skipped eventId=${eventId} reason=unsupported_event_type type=${event?.type ?? 'unknown'}`,
      );
      return;
    }

    try {
      await this.aiService.triggerAnalysis(eventId);
      this.logger.log(`ai_enqueued eventId=${eventId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.error(`ai_enqueue_failed eventId=${eventId} reason=${message}`);
    }
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
      this.eventGateway.broadcastNewEvent(repositoryId, {
        id: event.id,
        type: event.type,
        action: event.action,
        title: event.title,
        body: event.body,
        author: event.author,
        authorAvatar: event.authorAvatar,
        externalUrl: event.externalUrl,
        occurredAt: event.occurredAt,
        createdAt: event.createdAt,
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

    if (repositoryIds.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const where = {
      repositoryId: repositoryIds.length === 1 ? repositoryIds[0] : { in: repositoryIds },
    };

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
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const repositoryIds = await this.resolveRepositoryIds(userId, repositoryId, repositoryIdsParam);

    if (repositoryIds.length === 0) {
      return {
        total: 0,
        byType: [],
      };
    }

    const where: Record<string, unknown> = {
      repositoryId: repositoryIds.length === 1 ? repositoryIds[0] : { in: repositoryIds },
    };

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
