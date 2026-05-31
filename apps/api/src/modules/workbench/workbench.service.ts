import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalStatus,
  EventType,
  Platform,
  Repository,
  RepositoryAccessLevel,
  RepositoryAccessMode,
  RiskLevel,
  Role,
  prisma,
} from '@repo-pulse/database';
import {
  RepositoryAccessMembership,
  assertUserCanAccessRepository,
  getUserMonitoredRepositoryIds,
  isEditableRepositoryAccessLevel,
} from '../../common/utils/repository-access';
import { CreateRepositoryDto } from '../repository/dto/repository.dto';
import { RepositoryService } from '../repository/repository.service';
import { ReadConversationDto } from './dto/read-conversation.dto';
import { SyncService } from '../sync/sync.service';

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

@Injectable()
export class WorkbenchService {
  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly syncService: SyncService,
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

    const monitoredSet = new Set(monitoredRepositoryIds);
    const chatRepositories = memberships
      .map(({ repository, ...membership }) => {
        const repositoryView = this.toRepositoryView(repository, membership, monitoredSet.has(repository.id));
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
            where: { repositoryId: { in: repositoryIds } },
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

  async getConversationMessages(userId: string, repositoryId: string) {
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

    const [conversationState, events, approvals] = await Promise.all([
      prisma.userRepositoryConversationState.findUnique({
        where: {
          userId_repositoryId: {
            userId,
            repositoryId,
          },
        },
      }),
      prisma.event.findMany({
        where: { repositoryId },
        include: {
          analyses: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          approvals: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      prisma.approval.findMany({
        where: {
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
        orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    ]);

    const lastReadAt = conversationState?.lastReadAt ?? null;

    const eventMessages = events.map((event) => {
      const pendingApproval = event.approvals[0];
      const baseActions = this.buildBaseActions(event.externalUrl || undefined);
      const approvalActions =
        repositoryCanOperate && pendingApproval?.status === ApprovalStatus.PENDING
          ? this.buildApprovalActions(pendingApproval.id)
          : [];
      const agentAction = repositoryCanOperate ? [this.buildAgentAction()] : [];
      const messageTime = this.resolveEventMessageTime(event);
      return {
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
        actions: [...baseActions, ...approvalActions, ...agentAction],
        riskLevel: this.resolveEventRiskLevel(event.analyses),
        isUnread: this.isUnreadMessage(messageTime, lastReadAt),
        hasPendingApprovalAction:
          repositoryCanOperate && pendingApproval?.status === ApprovalStatus.PENDING,
        hasPendingAgentAction: false,
      };
    });

    const approvalMessages = approvals.map((approval) => {
      const baseActions = this.buildBaseActions(approval.event.externalUrl || undefined);
      const approvalActions =
        repositoryCanOperate && approval.status === ApprovalStatus.PENDING
          ? this.buildApprovalActions(approval.id)
          : [];
      const agentAction = repositoryCanOperate ? [this.buildAgentAction()] : [];
      const messageTime = this.resolveApprovalMessageTime(approval);
      return {
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
          `审批状态：${approval.status}`,
        author: approval.reviewer?.name || approval.event.author || 'system',
        authorAvatar: approval.reviewer?.avatar || approval.event.authorAvatar || undefined,
        createdAt: messageTime.toISOString(),
        externalUrl: approval.event.externalUrl || undefined,
        approvalId: approval.id,
        approvalStatus: approval.status,
        riskLevel: this.resolveApprovalRiskLevel(approval.event.analyses, approval.status),
        isUnread: this.isUnreadMessage(messageTime, lastReadAt),
        hasPendingApprovalAction:
          repositoryCanOperate && approval.status === ApprovalStatus.PENDING,
        hasPendingAgentAction: false,
        actions: [...baseActions, ...approvalActions, ...agentAction],
      };
    });

    const messages = [...eventMessages, ...approvalMessages].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );

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
        hasPendingApproval: approvalMessages.some(
          (message: { approvalStatus?: ApprovalStatus }) =>
            message.approvalStatus === ApprovalStatus.PENDING,
        ),
        pendingApprovalCount: approvalMessages.filter(
          (message: { approvalStatus?: ApprovalStatus }) =>
            message.approvalStatus === ApprovalStatus.PENDING,
        ).length,
        hasPendingAgentAction: false,
        pendingAgentActionCount: 0,
      },
      messages,
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
        where: { repositoryId },
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
    const monitoredSet = new Set(monitoredRepositoryIds);
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
      } catch (error) {
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
      canAddToMonitoring: !monitoredSet.has(event.repositoryId),
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
    const monitoredSet = new Set(monitoredRepositoryIds);

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

    const result = memberships.map(({ repository }) =>
      this.toWatchRepositoryItem(repository, monitoredSet),
    );
    console.log(`[getWatchRepositories] END - Returning ${result.length} repositories for user ${userId}`);
    return result;
  }

  async addWatchRepository(userId: string, dto: CreateRepositoryDto) {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    const monitoredSet = new Set(monitoredRepositoryIds);
    const repository = await this.repositoryService.create(userId, dto, {
      accessMode: RepositoryAccessMode.MONITOR,
      accessLevel: RepositoryAccessLevel.READ,
      role: Role.VIEWER,
      isStarred: true,
    });

    return this.toWatchRepositoryItem(repository, monitoredSet);
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
        label: '打开 GitHub',
        method: 'GET',
        requiresConfirmation: false,
        requiresPermission: false,
      });
    }
    actions.push({
      key: 'ai_analyze',
      label: 'AI 分析',
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
        label: '审批通过',
        method: 'POST',
        endpoint: `/approvals/${approvalId}/approve`,
        requiresConfirmation: true,
        requiresPermission: true,
      },
      {
        key: 'reject',
        label: '拒绝审批',
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
      label: '使用 Agent 处理',
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
}
