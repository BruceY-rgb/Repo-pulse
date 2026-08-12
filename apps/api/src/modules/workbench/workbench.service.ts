import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ApprovalStatus,
  EventType,
  Platform,
  Prisma,
  Repository,
  RepositoryAccessLevel,
  RepositoryAccessMode,
  RiskLevel,
  Role,
  prisma,
} from '@repo-pulse/database';
import { QUEUE_NAMES } from '@repo-pulse/shared';
import {
  RepositoryAccessMembership,
  assertUserCanAccessRepository,
  getUserMonitoredRepositoryIds,
  isEditableRepositoryAccessLevel,
} from '../../common/utils/repository-access';
import {
  normalizeRepositoryBranchScopes,
  parseRepositoryBranchScopesParam,
} from '../../common/utils/repository-branch-scope';
import { CreateRepositoryDto } from '../repository/dto/repository.dto';
import { RepositoryService } from '../repository/repository.service';
import { ReadConversationDto } from './dto/read-conversation.dto';
import { SyncService } from '../sync/sync.service';
import { ConversationMessagesQueryDto } from './dto/conversation-messages-query.dto';

const WATCH_FALLBACK_SYNC_STALE_MS = 5 * 60 * 1000;
const WATCH_FALLBACK_SYNC_MAX_ENQUEUE = 6;

type RepositoryAccessLevelApi =
  | 'owner'
  | 'admin'
  | 'maintain'
  | 'write'
  | 'triage'
  | 'read'
  | 'none';

type ConversationMessageType =
  | 'issue'
  | 'pull_request'
  | 'push'
  | 'release'
  | 'security'
  | 'approval'
  | 'agent'
  | 'notification';

type BranchSyncStatusKind = 'branch_ahead' | 'upstream_behind';

interface BranchSyncStatus {
  id: string;
  kind: BranchSyncStatusKind;
  title: string;
  body: string;
  branch?: string;
  defaultBranch?: string;
  upstreamRepository?: string;
  upstreamBranch?: string;
  aheadBy?: number;
  behindBy?: number;
  lastCommitSha?: string;
  occurredAt: string;
  commits: Array<{
    sha?: string;
    message?: string;
    author?: string;
    date?: string;
  }>;
}

interface BranchSyncEventLike {
  id: string;
  type: EventType;
  title: string;
  body: string | null;
  branch: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  branches: string[];
  metadata: Prisma.JsonValue;
  occurredAt: Date | null;
  createdAt: Date;
}

type RiskCounts = Record<RiskLevel, number>;

interface MessageAction {
  key: string;
  label: string;
  method: 'POST' | 'GET';
  endpoint?: string;
  requiresConfirmation: boolean;
  requiresPermission: boolean;
}

interface ConversationSummary {
  latestMessageAt: string | null;
  latestMessageType: ConversationMessageType | null;
  latestMessagePreview: string | null;
  unreadCount: number;
  unreadRiskLevel: RiskLevel | null;
  unreadRiskCounts: RiskCounts;
  hasPendingApproval: boolean;
  pendingApprovalCount: number;
  hasPendingAgentAction: boolean;
  pendingAgentActionCount: number;
}

interface ConversationStateSnapshot {
  lastReadAt: Date | null;
  lastViewedAt: Date | null;
}

interface ConversationMessageCursor {
  id: string;
  source: 'event' | 'approval';
  messageAt: string;
}

interface ConversationMessagePageRef {
  id: string;
  source: 'event' | 'approval';
  messageAt: Date;
}

@Injectable()
export class WorkbenchService {
  private readonly logger = new Logger(WorkbenchService.name);

  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly syncService: SyncService,
    @InjectQueue(QUEUE_NAMES.REPOSITORY_SYNC)
    private readonly syncQueue?: Queue<{ repositoryId: string; userId: string; silent?: boolean }>,
  ) {}

  async getChatRepositories(userId: string) {
    const [memberships, monitoredRepositoryIds] = await Promise.all([
      prisma.userRepository.findMany({
        where: { userId },
        include: {
          repository: true,
        },
      }),
      getUserMonitoredRepositoryIds(userId),
    ]);

    const chatRepositories = memberships
      .map(({ repository, ...membership }) => {
        const repositoryView = this.toRepositoryView(
          repository,
          membership,
          this.isRepositoryInMonitoringScope(monitoredRepositoryIds, repository.id),
        );
        if (repositoryView.isEditable) {
          return { repository, repositoryView, kind: 'editable' as const };
        }
        if (repositoryView.isMonitored) {
          return { repository, repositoryView, kind: 'monitored-readonly' as const };
        }
        return null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const repositoryIds = chatRepositories.map((item) => item.repository.id);
    const [conversationStateMap, events, approvals] = await Promise.all([
      this.getConversationStateMap(userId, repositoryIds),
      repositoryIds.length > 0
        ? prisma.event.findMany({
            where: {
              repositoryId: { in: repositoryIds },
              type: { notIn: this.getBranchSyncAlertTypes() },
            },
            include: {
              analyses: {
                where: { status: 'COMPLETED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
            orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
      repositoryIds.length > 0
        ? prisma.approval.findMany({
            where: {
              event: {
                repositoryId: { in: repositoryIds },
              },
            },
            include: {
              event: {
                include: {
                  analyses: {
                    where: { status: 'COMPLETED' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              },
            },
            orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
    ]);

    const summaryMap = new Map<string, ConversationSummary>();
    for (const repositoryId of repositoryIds) {
      summaryMap.set(repositoryId, this.createEmptyConversationSummary());
    }

    for (const event of events) {
      const summary = summaryMap.get(event.repositoryId);
      if (!summary) continue;

      const eventTime = this.resolveEventMessageTime(event);
      const riskLevel = this.resolveEventRiskLevel(event.analyses);
      this.updateConversationLatest(summary, {
        messageAt: eventTime,
        type: this.mapEventTypeToConversationType(event.type),
        preview: event.body || event.analyses[0]?.summary || event.title || null,
      });

      const lastReadAt = conversationStateMap.get(event.repositoryId)?.lastReadAt ?? null;
      if (this.isUnreadMessage(eventTime, lastReadAt)) {
        this.incrementUnread(summary, riskLevel);
      }
    }

    for (const approval of approvals) {
      const repositoryId = approval.event.repositoryId;
      const summary = summaryMap.get(repositoryId);
      if (!summary) continue;

      const approvalTime = this.resolveApprovalMessageTime(approval);
      const riskLevel = this.resolveApprovalRiskLevel(
        approval.event.analyses,
        approval.status,
      );
      this.updateConversationLatest(summary, {
        messageAt: approvalTime,
        type: 'approval',
        preview:
          approval.editedContent ||
          approval.originalContent ||
          approval.comment ||
          approval.event.title ||
          null,
      });

      if (approval.status === ApprovalStatus.PENDING) {
        summary.hasPendingApproval = true;
        summary.pendingApprovalCount += 1;
      }

      const lastReadAt = conversationStateMap.get(repositoryId)?.lastReadAt ?? null;
      if (this.isUnreadMessage(approvalTime, lastReadAt)) {
        this.incrementUnread(summary, riskLevel);
      }
    }

    const items = chatRepositories.map(({ repository, repositoryView, kind }) => {
      const conversationState = conversationStateMap.get(repository.id);
      const summary = summaryMap.get(repository.id) ?? this.createEmptyConversationSummary();
      return {
        repository: repositoryView,
        kind,
        lastReadAt: conversationState?.lastReadAt?.toISOString() ?? null,
        latestMessageAt: summary.latestMessageAt,
        latestMessageType: summary.latestMessageType,
        latestMessagePreview: summary.latestMessagePreview,
        unreadCount: summary.unreadCount,
        unreadRiskLevel: summary.unreadRiskLevel,
        unreadRiskCounts: summary.unreadRiskCounts,
        highRiskCount: summary.unreadRiskCounts.HIGH + summary.unreadRiskCounts.CRITICAL,
        hasPendingApproval: summary.hasPendingApproval,
        pendingApprovalCount: summary.pendingApprovalCount,
        hasPendingAgentAction: summary.hasPendingAgentAction,
        pendingAgentActionCount: summary.pendingAgentActionCount,
        requiresAttention:
          summary.unreadCount > 0 ||
          summary.hasPendingApproval ||
          summary.hasPendingAgentAction,
      };
    });

    return {
      editableRepositories: this.sortChatRepositories(
        items.filter((item) => item.kind === 'editable'),
      ),
      monitoredRepositories: this.sortChatRepositories(
        items.filter((item) => item.kind === 'monitored-readonly'),
      ),
    };
  }

  async getConversationMessages(
    userId: string,
    repositoryId: string,
    query: ConversationMessagesQueryDto = {},
  ) {
    const membership = await assertUserCanAccessRepository(userId, repositoryId);
    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    const repositoryCanOperate = isEditableRepositoryAccessLevel(membership.accessLevel);
    const repositoryAccessLevel = this.mapAccessLevelToApi(membership.accessLevel);
    const take = this.normalizeConversationMessagesTake(query.take);
    const skip = query.skip ?? 0;
    const cursor = this.parseConversationMessagesCursor(query.cursor);
    const repositoryBranchScopes = normalizeRepositoryBranchScopes(
      [repositoryId],
      parseRepositoryBranchScopesParam(query.branchScopes),
    );
    const scopedBranches = repositoryBranchScopes[repositoryId] ?? [];

    const [conversationState, messagePage] = await Promise.all([
      prisma.userRepositoryConversationState.findUnique({
        where: {
          userId_repositoryId: {
            userId,
            repositoryId,
          },
        },
      }),
      this.getConversationMessagePage(repositoryId, cursor, skip, take, scopedBranches),
    ]);
    const eventIds = messagePage.items
      .filter((item) => item.source === 'event')
      .map((item) => item.id);
    const approvalIds = messagePage.items
      .filter((item) => item.source === 'approval')
      .map((item) => item.id);
    const [rawEvents, approvals, branchSyncAlerts] = await Promise.all([
      eventIds.length > 0
        ? prisma.event.findMany({
            where: {
              repositoryId,
              id: { in: eventIds },
            },
            include: {
              analyses: {
                where: { status: 'COMPLETED' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              approvals: {
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
      approvalIds.length > 0
        ? prisma.approval.findMany({
            where: {
              id: { in: approvalIds },
              event: {
                repositoryId,
              },
            },
            include: {
              event: {
                include: {
                  analyses: {
                    where: { status: 'COMPLETED' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              },
              reviewer: {
                select: {
                  name: true,
                  avatar: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      eventIds.length > 0
        ? prisma.event.findMany({
            where: {
              repositoryId,
              type: { in: this.getBranchSyncAlertTypes() },
            },
            orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          })
        : Promise.resolve([]),
    ]);
    const events = rawEvents.filter((event) => !this.isBranchSyncAlertType(event.type));
    const branchSyncStatusesByEventId = this.buildBranchSyncStatusesByEventId(
      messagePage.items,
      events,
      branchSyncAlerts,
    );

    const lastReadAt = conversationState?.lastReadAt ?? null;

    const eventMessages = new Map(
      events.map((event) => {
        const pendingApproval = event.approvals[0];
        const baseActions = this.buildBaseActions(event.externalUrl || undefined);
        const approvalActions =
          repositoryCanOperate && pendingApproval?.status === ApprovalStatus.PENDING
            ? this.buildApprovalActions(pendingApproval.id)
            : [];
        const agentAction = repositoryCanOperate ? [this.buildAgentAction()] : [];
        const prNumber =
          (event.type === EventType.PR_OPENED || event.type === EventType.PR_CLOSED) &&
          event.metadata &&
          typeof event.metadata === 'object' &&
          'prNumber' in event.metadata
            ? (event.metadata as Record<string, unknown>).prNumber
            : undefined;
        const mergeAction =
          (event.type === EventType.PR_OPENED || event.type === EventType.PR_CLOSED) &&
          repositoryCanOperate &&
          typeof prNumber === 'number'
            ? [
                {
                  key: 'merge_pr' as const,
                  label: 'Merge PR',
                  method: 'POST' as const,
                  endpoint: `/repositories/${repositoryId}/pulls/${prNumber}/merge`,
                  requiresConfirmation: true,
                  requiresPermission: true,
                },
              ]
            : [];
        const branchSyncStatuses = branchSyncStatusesByEventId.get(event.id) ?? [];
        const messageTime = this.resolveEventMessageTime(event);
        const message = {
          id: event.id,
          repositoryId,
          repositoryAccessLevel,
          repositoryCanOperate,
          type: this.mapEventTypeToConversationType(event.type),
          title: event.title,
          body: event.body || event.analyses[0]?.summary || '',
          author: event.author,
          authorAvatar: event.authorAvatar || undefined,
          createdAt: messageTime.toISOString(),
          externalUrl: event.externalUrl || undefined,
          branch: event.branch || undefined,
          sourceBranch: event.sourceBranch || undefined,
          targetBranch: event.targetBranch || undefined,
          branches: event.branches,
          actions: [...baseActions, ...approvalActions, ...agentAction, ...mergeAction],
          riskLevel: this.resolveEventRiskLevel(event.analyses),
          isUnread: this.isUnreadMessage(messageTime, lastReadAt),
          hasPendingApprovalAction:
            repositoryCanOperate && pendingApproval?.status === ApprovalStatus.PENDING,
          hasPendingAgentAction: false,
          ...(branchSyncStatuses.length > 0 ? { branchSyncStatuses } : {}),
        };
        return [event.id, message] as const;
      }),
    );

    const approvalMessages = new Map(
      approvals.map((approval) => {
        const baseActions = this.buildBaseActions(approval.event.externalUrl || undefined);
        const approvalActions =
          repositoryCanOperate && approval.status === ApprovalStatus.PENDING
            ? this.buildApprovalActions(approval.id)
            : [];
        const agentAction = repositoryCanOperate ? [this.buildAgentAction()] : [];
        const messageTime = this.resolveApprovalMessageTime(approval);
        const message = {
          id: `approval-${approval.id}`,
          repositoryId,
          repositoryAccessLevel,
          repositoryCanOperate,
          type: 'approval' as const,
          title: approval.event.title,
          body:
            approval.editedContent ||
            approval.originalContent ||
            approval.comment ||
            `Approval status: ${approval.status}`,
          author: approval.reviewer?.name || approval.event.author || 'system',
          authorAvatar: approval.reviewer?.avatar || approval.event.authorAvatar || undefined,
          createdAt: messageTime.toISOString(),
          externalUrl: approval.event.externalUrl || undefined,
          branch: approval.event.branch || undefined,
          sourceBranch: approval.event.sourceBranch || undefined,
          targetBranch: approval.event.targetBranch || undefined,
          branches: approval.event.branches,
          approvalId: approval.id,
          approvalStatus: approval.status,
          riskLevel: this.resolveApprovalRiskLevel(approval.event.analyses, approval.status),
          isUnread: this.isUnreadMessage(messageTime, lastReadAt),
          hasPendingApprovalAction:
            repositoryCanOperate && approval.status === ApprovalStatus.PENDING,
          hasPendingAgentAction: false,
          actions: [...baseActions, ...approvalActions, ...agentAction],
        };
        return [approval.id, message] as const;
      }),
    );

    const messages = messagePage.items
      .map((item) =>
        item.source === 'event' ? eventMessages.get(item.id) : approvalMessages.get(item.id),
      )
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const unreadSummary = messages.reduce(
      (accumulator, message) => {
        if (!message.isUnread) {
          return accumulator;
        }

        this.incrementRiskCounts(accumulator.unreadRiskCounts, message.riskLevel);
        return {
          unreadCount: accumulator.unreadCount + 1,
          unreadRiskLevel: this.pickHigherRiskLevel(
            accumulator.unreadRiskLevel,
            message.riskLevel,
          ),
          unreadRiskCounts: accumulator.unreadRiskCounts,
        };
      },
      {
        unreadCount: 0,
        unreadRiskLevel: null as RiskLevel | null,
        unreadRiskCounts: this.createEmptyRiskCounts(),
      },
    );

    return {
      conversation: {
        repositoryId,
        lastReadAt: lastReadAt?.toISOString() ?? null,
        unreadCount: unreadSummary.unreadCount,
        unreadRiskLevel: unreadSummary.unreadRiskLevel,
        unreadRiskCounts: unreadSummary.unreadRiskCounts,
        hasPendingApproval: Array.from(approvalMessages.values()).some(
          (message: { approvalStatus?: ApprovalStatus }) =>
            message.approvalStatus === ApprovalStatus.PENDING,
        ),
        pendingApprovalCount: Array.from(approvalMessages.values()).filter(
          (message: { approvalStatus?: ApprovalStatus }) =>
            message.approvalStatus === ApprovalStatus.PENDING,
        ).length,
        hasPendingAgentAction: false,
        pendingAgentActionCount: 0,
      },
      messages,
      pagination: {
        cursor: query.cursor ?? null,
        skip,
        take,
        hasMore: messagePage.hasMore,
        nextCursor: messagePage.nextCursor,
      },
    };
  }

  async markConversationAsRead(
    userId: string,
    repositoryId: string,
    payload: ReadConversationDto,
  ) {
    await assertUserCanAccessRepository(userId, repositoryId);

    const [existingState, latestEvent, latestApproval] = await Promise.all([
      prisma.userRepositoryConversationState.findUnique({
        where: {
          userId_repositoryId: {
            userId,
            repositoryId,
          },
        },
      }),
      prisma.event.findFirst({
        where: {
          repositoryId,
          type: { notIn: this.getBranchSyncAlertTypes() },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          occurredAt: true,
          createdAt: true,
        },
      }),
      prisma.approval.findFirst({
        where: {
          event: {
            repositoryId,
          },
        },
        orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          reviewedAt: true,
          createdAt: true,
        },
      }),
    ]);

    const requestedReadAt = payload.upToMessageAt ?? payload.readAt;
    const fallbackLatestMessageAt = this.pickLaterDate(
      latestEvent ? this.resolveEventMessageTime(latestEvent) : null,
      latestApproval ? this.resolveApprovalMessageTime(latestApproval) : null,
    );
    const candidateReadAt = requestedReadAt
      ? new Date(requestedReadAt)
      : fallbackLatestMessageAt ?? new Date();
    const nextLastReadAt = this.pickLaterDate(existingState?.lastReadAt ?? null, candidateReadAt);
    const lastViewedAt = new Date();

    const state = await prisma.userRepositoryConversationState.upsert({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId,
        },
      },
      create: {
        userId,
        repositoryId,
        lastReadAt: nextLastReadAt,
        lastViewedAt,
      },
      update: {
        lastReadAt: nextLastReadAt,
        lastViewedAt,
      },
    });

    return {
      success: true,
      repositoryId,
      lastReadAt: state.lastReadAt?.toISOString() ?? null,
      lastViewedAt: state.lastViewedAt?.toISOString() ?? null,
    };
  }

  async getWatchFeed(
    userId: string,
    typesParam?: string,
    cursor?: string,
    limit = 20,
  ) {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    const editableAccessLevels = [
      RepositoryAccessLevel.OWNER,
      RepositoryAccessLevel.ADMIN,
      RepositoryAccessLevel.MAINTAIN,
      RepositoryAccessLevel.WRITE,
    ];
    let memberships = await prisma.userRepository.findMany({
      where: {
        userId,
        isStarred: true,
        accessLevel: { notIn: editableAccessLevels },
        repository: { platform: Platform.GITHUB },
        ...(monitoredRepositoryIds.length > 0
          ? { repositoryId: { notIn: monitoredRepositoryIds } }
          : {}),
      },
      select: { repositoryId: true },
    });

    if (memberships.length === 0) {
      try {
        await this.syncService.syncUserRepositories(userId);
        memberships = await prisma.userRepository.findMany({
          where: {
            userId,
            isStarred: true,
            accessLevel: { notIn: editableAccessLevels },
            repository: { platform: Platform.GITHUB },
            ...(monitoredRepositoryIds.length > 0
              ? { repositoryId: { notIn: monitoredRepositoryIds } }
              : {}),
          },
          select: { repositoryId: true },
        });
      } catch {
        // sync failed, ignore and continue
      }
    }

    const candidateRepositoryIds = memberships.map((membership) => membership.repositoryId);

    if (candidateRepositoryIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const filterTypes = this.parseWatchFeedTypes(typesParam);
    const cursorValue = this.parseCursor(cursor);
    const events = await prisma.event.findMany({
      where: {
        repositoryId: { in: candidateRepositoryIds },
        ...(filterTypes.length > 0 ? { type: { in: filterTypes } } : {}),
        ...(cursorValue
          ? {
              OR: [
                { occurredAt: { lt: cursorValue.occurredAt } },
                {
                  occurredAt: cursorValue.occurredAt,
                  id: { lt: cursorValue.id },
                },
              ],
            }
          : {}),
      },
      include: {
        repository: true,
        analyses: {
          where: { status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const pageItems = events.slice(0, limit).map((event) => ({
      id: event.id,
      repositoryId: event.repositoryId,
      repositoryFullName: event.repository.fullName,
      repositoryAvatar: undefined,
      type: this.mapEventTypeToWatchFeedType(event.type),
      title: event.title,
      summary: event.body || event.analyses[0]?.summary || event.title,
      author: event.author,
      authorAvatar: event.authorAvatar || undefined,
      occurredAt: (event.occurredAt ?? event.createdAt).toISOString(),
      externalUrl: event.externalUrl || undefined,
      aiInsight: event.analyses[0]?.summary || undefined,
      canAddToMonitoring: !this.isRepositoryInMonitoringScope(monitoredRepositoryIds, event.repositoryId),
    }));

    const tail = events[limit];
    return {
      items: pageItems,
      nextCursor: tail
        ? this.buildCursor(tail.occurredAt ?? tail.createdAt, tail.id)
        : null,
    };
  }

  async getWatchRepositories(userId: string) {
    console.log(`[getWatchRepositories] START - userId=${userId}`);
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);

    let memberships = await prisma.userRepository.findMany({
      where: {
        userId,
        isStarred: true,
        repository: { platform: Platform.GITHUB },
      },
      include: {
        repository: {
          include: {
            _count: {
              select: { events: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`[getWatchRepositories] DB QUERY - Found ${memberships.length} starred memberships for user ${userId}`);

    if (memberships.length === 0) {
      try {
        console.log(`[getWatchRepositories] EMPTY - Triggering syncUserRepositories for user ${userId}`);
        await this.syncService.syncUserRepositories(userId);
        memberships = await prisma.userRepository.findMany({
          where: {
            userId,
            isStarred: true,
            repository: { platform: Platform.GITHUB },
          },
          include: {
            repository: {
              include: {
                _count: {
                  select: { events: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        console.log(`[getWatchRepositories] POST-SYNC - Found ${memberships.length} starred memberships for user ${userId}`);
      } catch (error) {
        console.error(`[getWatchRepositories] SYNC ERROR for user ${userId}:`, error);
      }
    }

    await this.enqueueFallbackSyncForWatchRepositories(userId, memberships);

    const result = memberships.map(({ repository }) =>
      this.toWatchRepositoryItem(
        repository,
        new Set(monitoredRepositoryIds),
      ),
    );
    console.log(`[getWatchRepositories] END - Returning ${result.length} repositories for user ${userId}`);
    return result;
  }

  private async enqueueFallbackSyncForWatchRepositories(
    userId: string,
    memberships: Array<{
      repositoryId: string;
      repository: {
        id: string;
        fullName: string;
        webhookId: string | null;
        webhookStatus: string | null;
        lastSyncAt: Date | null;
      };
    }>,
  ): Promise<void> {
    const now = Date.now();
    const stale = memberships
      .map((membership) => membership.repository)
      .filter((repository) => {
        const webhookActive = Boolean(repository.webhookId) && repository.webhookStatus === 'ACTIVE';
        if (webhookActive) {
          return false;
        }

        const lastSyncAt = repository.lastSyncAt?.getTime() ?? 0;
        return now - lastSyncAt >= WATCH_FALLBACK_SYNC_STALE_MS;
      })
      .slice(0, WATCH_FALLBACK_SYNC_MAX_ENQUEUE);

    if (stale.length === 0) {
      return;
    }
    if (!this.syncQueue) {
      this.logger.warn(`watch_fallback_sync_skipped userId=${userId} reason=sync_queue_unavailable`);
      return;
    }
    const syncQueue = this.syncQueue;

    const syncBucket = Math.floor(now / WATCH_FALLBACK_SYNC_STALE_MS);
    const outcomes = await Promise.all(
      stale.map(async (repository) => {
        const jobId = `watch-fallback-${userId}-${repository.id}-${syncBucket}`;
        try {
          const existingJob = await syncQueue.getJob(jobId);
          if (existingJob) {
            return { status: 'deduped' as const, repository };
          }

          await syncQueue.add(
            'sync',
            { repositoryId: repository.id, userId, silent: true },
            {
              jobId,
              removeOnComplete: true,
              removeOnFail: 20,
            },
          );
          return { status: 'queued' as const, repository };
        } catch (error) {
          return {
            status: 'failed' as const,
            repository,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const queuedCount = outcomes.filter((result) => result.status === 'queued').length;
    const dedupedCount = outcomes.filter((result) => result.status === 'deduped').length;
    const failed = outcomes.filter((result) => result.status === 'failed');
    if (failed.length > 0) {
      this.logger.warn(
        `watch_fallback_sync_failed userId=${userId} failed=${failed.length}/${stale.length} reasons=${failed
          .slice(0, 3)
          .map((result) => `${result.repository.fullName}:${result.reason}`)
          .join(';')}`,
      );
    }

    this.logger.log(
      `watch_fallback_sync_scheduled userId=${userId} queued=${queuedCount} deduped=${dedupedCount} failed=${failed.length} candidates=${stale.length} repositories=${stale
        .map((repository) => repository.fullName)
        .join(',')}`,
    );
  }

  async addWatchRepository(userId: string, dto: CreateRepositoryDto) {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });
    const repository = await this.repositoryService.create(userId, dto, {
      accessMode: RepositoryAccessMode.MONITOR,
      accessLevel: RepositoryAccessLevel.READ,
      role: Role.VIEWER,
      isStarred: true,
      userOAuthToken: user?.githubAccessToken || undefined,
    });

    return this.toWatchRepositoryItem(
      repository,
      new Set(this.isRepositoryInMonitoringScope(monitoredRepositoryIds, repository.id) ? [repository.id] : monitoredRepositoryIds),
    );
  }

  private async getConversationStateMap(
    userId: string,
    repositoryIds: string[],
  ): Promise<Map<string, ConversationStateSnapshot>> {
    if (repositoryIds.length === 0) {
      return new Map<string, ConversationStateSnapshot>();
    }

    const states = await prisma.userRepositoryConversationState.findMany({
      where: {
        userId,
        repositoryId: { in: repositoryIds },
      },
      select: {
        repositoryId: true,
        lastReadAt: true,
        lastViewedAt: true,
      },
    });

    return new Map(
      states.map((state: { repositoryId: string; lastReadAt: Date | null; lastViewedAt: Date | null }) => [
        state.repositoryId,
        {
          lastReadAt: state.lastReadAt,
          lastViewedAt: state.lastViewedAt,
        },
      ]),
    );
  }

  private isRepositoryInMonitoringScope(monitoredRepositoryIds: string[], repositoryId: string): boolean {
    return monitoredRepositoryIds.includes(repositoryId);
  }

  private getBranchSyncAlertTypes(): EventType[] {
    return [EventType.BRANCH_SYNC_ALERT, EventType.UPSTREAM_SYNC_ALERT];
  }

  private isBranchSyncAlertType(type: EventType): boolean {
    return this.getBranchSyncAlertTypes().includes(type);
  }

  private isBranchSyncAnchorType(type: EventType): boolean {
    const anchorTypes: EventType[] = [
      EventType.PUSH,
      EventType.PR_OPENED,
      EventType.PR_MERGED,
      EventType.PR_CLOSED,
      EventType.PR_REVIEW,
      EventType.BRANCH_CREATED,
      EventType.BRANCH_DELETED,
    ];

    return anchorTypes.includes(type);
  }

  private buildBranchSyncStatusesByEventId(
    pageItems: ConversationMessagePageRef[],
    events: BranchSyncEventLike[],
    branchSyncAlerts: BranchSyncEventLike[],
  ): Map<string, BranchSyncStatus[]> {
    const alerts = branchSyncAlerts.filter((event) => this.isBranchSyncAlertType(event.type));
    if (events.length === 0 || alerts.length === 0) {
      return new Map();
    }

    const pageIndex = new Map(
      pageItems.map((item, index) => [`${item.source}:${item.id}`, index]),
    );
    const anchors = events
      .filter((event) => this.isBranchSyncAnchorType(event.type))
      .sort((left, right) => {
        const leftIndex = pageIndex.get(`event:${left.id}`) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = pageIndex.get(`event:${right.id}`) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });

    const statusesByEventId = new Map<string, BranchSyncStatus[]>();
    const seenStatusKeys = new Set<string>();
    for (const alert of alerts) {
      const branch = this.resolveBranchSyncAlertBranch(alert);
      const statusKey = `${alert.type}:${branch || alert.id}`;
      if (seenStatusKeys.has(statusKey)) {
        continue;
      }
      const anchor = anchors.find((event) =>
        this.isEventRelatedToBranchSyncAlert(event, branch),
      );
      if (!anchor) {
        continue;
      }

      seenStatusKeys.add(statusKey);
      const statuses = statusesByEventId.get(anchor.id) ?? [];
      statuses.push(this.toBranchSyncStatus(alert));
      statusesByEventId.set(anchor.id, statuses);
    }

    return statusesByEventId;
  }

  private isEventRelatedToBranchSyncAlert(
    event: BranchSyncEventLike,
    alertBranch: string | null,
  ): boolean {
    if (!alertBranch) {
      return false;
    }

    const branches = new Set(
      [
        event.branch,
        event.sourceBranch,
        event.targetBranch,
        ...(event.branches ?? []),
      ].filter((branch): branch is string => Boolean(branch)),
    );

    return branches.has(alertBranch);
  }

  private resolveBranchSyncAlertBranch(alert: BranchSyncEventLike): string | null {
    const metadata = this.asRecord(alert.metadata);
    return (
      alert.branch ||
      this.toOptionalString(metadata.branch) ||
      this.toOptionalString(metadata.defaultBranch) ||
      this.toOptionalString(metadata.upstreamBranch) ||
      null
    );
  }

  private toBranchSyncStatus(alert: BranchSyncEventLike): BranchSyncStatus {
    const metadata = this.asRecord(alert.metadata);
    const isUpstream = alert.type === EventType.UPSTREAM_SYNC_ALERT;
    const commitList = isUpstream ? metadata.upstreamCommits : metadata.aheadCommits;

    return {
      id: alert.id,
      kind: isUpstream ? 'upstream_behind' : 'branch_ahead',
      title: alert.title,
      body: alert.body || '',
      branch: alert.branch || undefined,
      defaultBranch: this.toOptionalString(metadata.defaultBranch),
      upstreamRepository: this.toOptionalString(metadata.upstreamRepository),
      upstreamBranch: this.toOptionalString(metadata.upstreamBranch),
      aheadBy: this.toOptionalNumber(metadata.aheadBy),
      behindBy: this.toOptionalNumber(metadata.behindBy),
      lastCommitSha:
        this.toOptionalString(metadata.lastCommitSha) ||
        this.toOptionalString(metadata.upstreamLastCommitSha),
      occurredAt: this.resolveEventMessageTime(alert).toISOString(),
      commits: this.normalizeBranchSyncCommits(commitList),
    };
  }

  private normalizeBranchSyncCommits(value: unknown): BranchSyncStatus['commits'] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.slice(0, 5).map((item) => {
      const commit = this.asRecord(item);
      return {
        sha: this.toOptionalString(commit.sha),
        message: this.toOptionalString(commit.message),
        author: this.toOptionalString(commit.author),
        date: this.toOptionalString(commit.date),
      };
    });
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private toWatchRepositoryItem(
    repository: Pick<Repository, 'id' | 'name' | 'fullName' | 'platform' | 'externalId' | 'url' | 'defaultBranch' | 'isActive' | 'lastSyncAt'> & {
      _count?: { events: number };
    },
    monitoredSet: Set<string>,
  ) {
    const isMonitored = monitoredSet.has(repository.id);
    return {
      id: repository.id,
      name: repository.name,
      fullName: repository.fullName,
      platform: repository.platform,
      externalId: repository.externalId,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
      isActive: repository.isActive,
      lastSyncAt: repository.lastSyncAt?.toISOString() ?? null,
      eventCount: repository._count?.events ?? 0,
      isMonitored,
      canAddToMonitoring: !isMonitored,
    };
  }

  private toRepositoryView(
    repository: {
      id: string;
      name: string;
      fullName: string;
      url: string;
      defaultBranch: string;
    },
    membership: RepositoryAccessMembership,
    isMonitored: boolean,
  ) {
    const isEditable = isEditableRepositoryAccessLevel(membership.accessLevel);
    return {
      id: repository.id,
      name: repository.name,
      fullName: repository.fullName,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
      accessLevel: this.mapAccessLevelToApi(membership.accessLevel),
      canOperate: isEditable,
      isMonitored,
      isEditable,
    };
  }

  private createEmptyRiskCounts(): RiskCounts {
    return {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
  }

  private createEmptyConversationSummary(): ConversationSummary {
    return {
      latestMessageAt: null,
      latestMessageType: null,
      latestMessagePreview: null,
      unreadCount: 0,
      unreadRiskLevel: null,
      unreadRiskCounts: this.createEmptyRiskCounts(),
      hasPendingApproval: false,
      pendingApprovalCount: 0,
      hasPendingAgentAction: false,
      pendingAgentActionCount: 0,
    };
  }

  private updateConversationLatest(
    summary: ConversationSummary,
    input: {
      messageAt: Date;
      type: ConversationMessageType;
      preview: string | null;
    },
  ) {
    const currentLatest = summary.latestMessageAt ? new Date(summary.latestMessageAt) : null;
    if (!currentLatest || input.messageAt.getTime() > currentLatest.getTime()) {
      summary.latestMessageAt = input.messageAt.toISOString();
      summary.latestMessageType = input.type;
      summary.latestMessagePreview = input.preview;
    }
  }

  private incrementUnread(summary: ConversationSummary, riskLevel: RiskLevel | null) {
    summary.unreadCount += 1;
    this.incrementRiskCounts(summary.unreadRiskCounts, riskLevel);
    summary.unreadRiskLevel = this.pickHigherRiskLevel(summary.unreadRiskLevel, riskLevel);
  }

  private incrementRiskCounts(riskCounts: RiskCounts, riskLevel: RiskLevel | null) {
    const normalizedRiskLevel = riskLevel ?? RiskLevel.LOW;
    riskCounts[normalizedRiskLevel] += 1;
  }

  private pickHigherRiskLevel(
    left: RiskLevel | null,
    right: RiskLevel | null,
  ): RiskLevel | null {
    const rank = {
      [RiskLevel.LOW]: 1,
      [RiskLevel.MEDIUM]: 2,
      [RiskLevel.HIGH]: 3,
      [RiskLevel.CRITICAL]: 4,
    };

    if (!left) return right;
    if (!right) return left;
    return rank[right] > rank[left] ? right : left;
  }

  private resolveEventMessageTime(event: { occurredAt: Date | null; createdAt: Date }): Date {
    return event.occurredAt ?? event.createdAt;
  }

  private resolveApprovalMessageTime(approval: {
    reviewedAt: Date | null;
    createdAt: Date;
  }): Date {
    return approval.reviewedAt ?? approval.createdAt;
  }

  private resolveEventRiskLevel(
    analyses?: Array<{
      riskLevel: RiskLevel;
    }>,
  ): RiskLevel | null {
    return analyses?.[0]?.riskLevel ?? null;
  }

  private resolveApprovalRiskLevel(
    analyses: Array<{ riskLevel: RiskLevel }> | undefined,
    status: ApprovalStatus,
  ): RiskLevel {
    if (analyses?.[0]?.riskLevel) {
      return analyses[0].riskLevel;
    }

    return status === ApprovalStatus.PENDING ? RiskLevel.HIGH : RiskLevel.MEDIUM;
  }

  private isUnreadMessage(messageAt: Date, lastReadAt: Date | null): boolean {
    if (!lastReadAt) {
      return true;
    }

    return messageAt.getTime() > lastReadAt.getTime();
  }

  private pickLaterDate(left: Date | null, right: Date | null): Date | null {
    if (!left) return right;
    if (!right) return left;
    return right.getTime() > left.getTime() ? right : left;
  }

  private sortChatRepositories<T extends { latestMessageAt: string | null }>(items: T[]): T[] {
    return [...items].sort((left, right) => {
      if (left.latestMessageAt && right.latestMessageAt) {
        return new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime();
      }
      if (left.latestMessageAt) return -1;
      if (right.latestMessageAt) return 1;
      return 0;
    });
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

  private mapEventTypeToConversationType(type: EventType): ConversationMessageType {
    switch (type) {
      case EventType.ISSUE_OPENED:
      case EventType.ISSUE_CLOSED:
      case EventType.ISSUE_COMMENT:
        return 'issue';
      case EventType.PR_OPENED:
      case EventType.PR_MERGED:
      case EventType.PR_CLOSED:
      case EventType.PR_REVIEW:
        return 'pull_request';
      case EventType.PUSH:
      case EventType.BRANCH_CREATED:
      case EventType.BRANCH_DELETED:
        return 'push';
      case EventType.RELEASE:
        return 'release';
      default:
        return 'notification';
    }
  }

  private mapEventTypeToWatchFeedType(type: EventType) {
    switch (type) {
      case EventType.ISSUE_OPENED:
      case EventType.ISSUE_CLOSED:
      case EventType.ISSUE_COMMENT:
        return 'issue' as const;
      case EventType.PR_OPENED:
      case EventType.PR_MERGED:
      case EventType.PR_CLOSED:
      case EventType.PR_REVIEW:
        return 'pull_request' as const;
      case EventType.RELEASE:
        return 'release' as const;
      default:
        return 'push' as const;
    }
  }

  private buildBaseActions(externalUrl?: string): MessageAction[] {
    const actions: MessageAction[] = [];
    if (externalUrl) {
      actions.push({
        key: 'open_github',
        label: 'Open GitHub',
        method: 'GET',
        requiresConfirmation: false,
        requiresPermission: false,
      });
    }
    actions.push({
      key: 'ai_analyze',
      label: 'AI Analyze',
      method: 'POST',
      endpoint: `/ai/trigger/__EVENT_ID__`,
      requiresConfirmation: false,
      requiresPermission: false,
    });
    return actions;
  }

  private buildApprovalActions(approvalId: string): MessageAction[] {
    return [
      {
        key: 'approve',
        label: 'Approve',
        method: 'POST',
        endpoint: `/approvals/${approvalId}/approve`,
        requiresConfirmation: true,
        requiresPermission: true,
      },
      {
        key: 'reject',
        label: 'Reject',
        method: 'POST',
        endpoint: `/approvals/${approvalId}/reject`,
        requiresConfirmation: true,
        requiresPermission: true,
      },
    ];
  }

  private buildAgentAction(): MessageAction {
    return {
      key: 'agent_handle',
      label: 'Handle with Agent',
      method: 'POST',
      requiresConfirmation: true,
      requiresPermission: true,
    };
  }

  private parseWatchFeedTypes(typesParam?: string): EventType[] {
    if (!typesParam) {
      return [];
    }

    const values = typesParam
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const typeMap: Record<string, EventType[]> = {
      issue: [EventType.ISSUE_OPENED, EventType.ISSUE_CLOSED, EventType.ISSUE_COMMENT],
      pr: [EventType.PR_OPENED, EventType.PR_MERGED, EventType.PR_CLOSED, EventType.PR_REVIEW],
      pull_request: [EventType.PR_OPENED, EventType.PR_MERGED, EventType.PR_CLOSED, EventType.PR_REVIEW],
      push: [EventType.PUSH, EventType.BRANCH_CREATED, EventType.BRANCH_DELETED],
      release: [EventType.RELEASE],
      security: [],
    };

    return Array.from(new Set(values.flatMap((value) => typeMap[value] ?? [])));
  }

  private parseCursor(cursor?: string): { occurredAt: Date; id: string } | null {
    if (!cursor) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        occurredAt: string;
        id: string;
      };
      return {
        occurredAt: new Date(decoded.occurredAt),
        id: decoded.id,
      };
    } catch {
      return null;
    }
  }

  private buildCursor(occurredAt: Date, id: string): string {
    return Buffer.from(
      JSON.stringify({
        occurredAt: occurredAt.toISOString(),
        id,
      }),
      'utf8',
    ).toString('base64url');
  }

  private normalizeConversationMessagesTake(take?: number): number {
    if (!take) {
      return 50;
    }

    return Math.min(Math.max(take, 1), 100);
  }

  private parseConversationMessagesCursor(cursor?: string): ConversationMessageCursor | null {
    if (!cursor) {
      return null;
    }

    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        id?: string;
        source?: 'event' | 'approval';
        messageAt?: string;
      };

      if (
        !decoded.id ||
        !decoded.messageAt ||
        (decoded.source !== 'event' && decoded.source !== 'approval')
      ) {
        return null;
      }

      return {
        id: decoded.id,
        source: decoded.source,
        messageAt: decoded.messageAt,
      };
    } catch {
      return null;
    }
  }

  private buildConversationMessagesCursor(item: ConversationMessagePageRef): string {
    return Buffer.from(
      JSON.stringify({
        id: item.id,
        source: item.source,
        messageAt: item.messageAt.toISOString(),
      }),
      'utf8',
    ).toString('base64url');
  }

  private async getConversationMessagePage(
    repositoryId: string,
    cursor: ConversationMessageCursor | null,
    skip: number,
    take: number,
    scopedBranches: string[],
  ): Promise<{
    items: ConversationMessagePageRef[];
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const sourcePrioritySql = Prisma.sql`CASE WHEN merged.source = 'event' THEN 1 ELSE 0 END`;
    const branchScopeSql = this.buildConversationBranchScopeSql(scopedBranches);
    const cursorTime = cursor ? new Date(cursor.messageAt) : null;
    const cursorPriority = cursor?.source === 'event' ? 1 : 0;
    const cursorFilterSql =
      cursor && cursorTime && !Number.isNaN(cursorTime.getTime())
        ? Prisma.sql`
            WHERE (
              merged."messageAt" < ${cursorTime}
              OR (
                merged."messageAt" = ${cursorTime}
                AND (
                  ${sourcePrioritySql} < ${cursorPriority}
                  OR (${sourcePrioritySql} = ${cursorPriority} AND merged.id < ${cursor.id})
                )
              )
            )
          `
        : Prisma.empty;

    const rows = await prisma.$queryRaw<Array<{ id: string; source: 'event' | 'approval'; messageAt: Date }>>(
      Prisma.sql`
        SELECT merged.id, merged.source, merged."messageAt"
        FROM (
          SELECT
            e.id,
            'event' AS source,
            COALESCE(e."occurredAt", e."createdAt") AS "messageAt"
          FROM "Event" e
          WHERE e."repositoryId" = ${repositoryId}
          AND e."type" NOT IN ('BRANCH_SYNC_ALERT'::"EventType", 'UPSTREAM_SYNC_ALERT'::"EventType")
          ${branchScopeSql}

          UNION ALL

          SELECT
            a.id,
            'approval' AS source,
            COALESCE(a."reviewedAt", a."createdAt") AS "messageAt"
          FROM "Approval" a
          INNER JOIN "Event" e ON e.id = a."eventId"
          WHERE e."repositoryId" = ${repositoryId}
          ${branchScopeSql}
        ) AS merged
        ${cursorFilterSql}
        ORDER BY merged."messageAt" DESC, ${sourcePrioritySql} DESC, merged.id DESC
        OFFSET ${skip}
        LIMIT ${take + 1}
      `,
    );

    const items = rows.slice(0, take).map((row) => ({
      id: row.id,
      source: row.source,
      messageAt: new Date(row.messageAt),
    }));
    const tail = items[items.length - 1] ?? null;

    return {
      items,
      hasMore: rows.length > take,
      nextCursor: rows.length > take && tail ? this.buildConversationMessagesCursor(tail) : null,
    };
  }

  private buildConversationBranchScopeSql(scopedBranches: string[]) {
    if (scopedBranches.length === 0) {
      return Prisma.empty;
    }

    return Prisma.sql`
      AND (
        e."branches" && ARRAY[${Prisma.join(scopedBranches)}]::text[]
        OR e."branch" IN (${Prisma.join(scopedBranches)})
        OR e."sourceBranch" IN (${Prisma.join(scopedBranches)})
        OR e."targetBranch" IN (${Prisma.join(scopedBranches)})
        OR (
          cardinality(e."branches") = 0
          AND e."type" IN ('ISSUE_OPENED'::"EventType", 'ISSUE_CLOSED'::"EventType", 'ISSUE_COMMENT'::"EventType")
        )
      )
    `;
  }
}
