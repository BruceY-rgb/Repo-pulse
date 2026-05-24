import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalStatus,
  EventType,
  NotificationChannel,
  Platform,
  RepositoryAccessLevel,
  prisma,
} from '@repo-pulse/database';
import {
  RepositoryAccessMembership,
  assertUserCanAccessRepository,
  getUserMonitoredRepositoryIds,
  isEditableRepositoryAccessLevel,
} from '../../common/utils/repository-access';

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

interface MessageAction {
  key: string;
  label: string;
  method: 'POST' | 'GET';
  endpoint?: string;
  requiresConfirmation: boolean;
  requiresPermission: boolean;
}

@Injectable()
export class WorkbenchService {
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
    const latestEvents = repositoryIds.length > 0
      ? await prisma.event.findMany({
          where: { repositoryId: { in: repositoryIds } },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            id: true,
            repositoryId: true,
            title: true,
            body: true,
            occurredAt: true,
            createdAt: true,
          },
        })
      : [];

    const latestEventMap = new Map<string, (typeof latestEvents)[number]>();
    for (const event of latestEvents) {
      if (!latestEventMap.has(event.repositoryId)) {
        latestEventMap.set(event.repositoryId, event);
      }
    }

    const unreadCountMap = new Map<string, number>();
    if (repositoryIds.length > 0) {
      const unreadNotifications = await prisma.notification.findMany({
        where: {
          userId,
          channel: NotificationChannel.IN_APP,
          readAt: null,
          event: {
            repositoryId: { in: repositoryIds },
          },
        },
        select: {
          event: {
            select: {
              repositoryId: true,
            },
          },
        },
      });
      for (const item of unreadNotifications) {
        const repositoryId = item.event?.repositoryId;
        if (!repositoryId) continue;
        unreadCountMap.set(repositoryId, (unreadCountMap.get(repositoryId) ?? 0) + 1);
      }
    }

    const highRiskCountMap = new Map<string, number>();
    if (repositoryIds.length > 0) {
      const highRiskAnalyses = await prisma.aIAnalysis.findMany({
        where: {
          riskLevel: { in: ['HIGH', 'CRITICAL'] },
          event: {
            repositoryId: { in: repositoryIds },
          },
        },
        select: {
          event: {
            select: {
              repositoryId: true,
            },
          },
        },
      });
      for (const item of highRiskAnalyses) {
        const repositoryId = item.event.repositoryId;
        highRiskCountMap.set(repositoryId, (highRiskCountMap.get(repositoryId) ?? 0) + 1);
      }
    }

    const items = chatRepositories.map(({ repository, repositoryView, kind }) => {
      const latestEvent = latestEventMap.get(repository.id);
      return {
        repository: repositoryView,
        kind,
        latestMessageAt: latestEvent
          ? (latestEvent.occurredAt ?? latestEvent.createdAt).toISOString()
          : null,
        latestMessagePreview: latestEvent?.body || latestEvent?.title || null,
        unreadCount: unreadCountMap.get(repository.id) ?? 0,
        highRiskCount: highRiskCountMap.get(repository.id) ?? 0,
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

    const [events, approvals] = await Promise.all([
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
          event: true,
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

    const eventMessages = events.map((event) => {
      const pendingApproval = event.approvals[0];
      const baseActions = this.buildBaseActions(event.externalUrl || undefined);
      const approvalActions =
        repositoryCanOperate && pendingApproval?.status === ApprovalStatus.PENDING
          ? this.buildApprovalActions(pendingApproval.id)
          : [];
      const agentAction = repositoryCanOperate ? [this.buildAgentAction()] : [];
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
        createdAt: (event.occurredAt ?? event.createdAt).toISOString(),
        externalUrl: event.externalUrl || undefined,
        actions: [...baseActions, ...approvalActions, ...agentAction],
      };
    });

    const approvalMessages = approvals.map((approval) => {
      const baseActions = this.buildBaseActions(approval.event.externalUrl || undefined);
      const approvalActions =
        repositoryCanOperate && approval.status === ApprovalStatus.PENDING
          ? this.buildApprovalActions(approval.id)
          : [];
      const agentAction = repositoryCanOperate ? [this.buildAgentAction()] : [];
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
        createdAt: (approval.reviewedAt ?? approval.createdAt).toISOString(),
        externalUrl: approval.event.externalUrl || undefined,
        actions: [...baseActions, ...approvalActions, ...agentAction],
      };
    });

    return [...eventMessages, ...approvalMessages].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
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
    const memberships = await prisma.userRepository.findMany({
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

  private toRepositoryView(
    repository: {
      id: string;
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
      fullName: repository.fullName,
      url: repository.url,
      defaultBranch: repository.defaultBranch,
      accessLevel: this.mapAccessLevelToApi(membership.accessLevel),
      canOperate: isEditable,
      isMonitored,
      isEditable,
    };
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
