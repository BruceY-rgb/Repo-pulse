import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DESKTOP_LOCAL_EVENTS,
  REALTIME_EVENTS,
  type RealtimeEventName,
  type RealtimeEventPayloadMap,
} from '@repo-pulse/shared';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';
import { workbenchQueryKeys } from '@/hooks/queries/use-workbench-queries';
import {
  analysisQueryKeys,
  approvalQueryKeys,
} from '@/hooks/queries/realtime-query-keys';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { useSyncProgressStore } from '@/stores/sync-progress.store';
import { getSocketUrl, isDesktopRuntime } from '@/lib/desktop';
import { useWorkbenchUnreadStore } from '@/stores/workbench-unread.store';
import { getLastSeq, setLastSeq } from '@/lib/event-seq';

export const REALTIME_INVALIDATION_BUDGET_MS = 50;

type LegacyRealtimeEventName = 'event:new' | 'events:new' | 'analysis:completed';
type RealtimeQueryClient = Pick<QueryClient, 'invalidateQueries' | 'refetchQueries'>;

interface RepositoryRealtimePayload {
  repositoryId?: string;
  data?: unknown;
  timestamp?: string;
}

function getCandidateMessageAt(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as {
    occurredAt?: unknown;
    createdAt?: unknown;
    timestamp?: unknown;
  };
  const candidate = record.occurredAt ?? record.createdAt ?? record.timestamp;
  return typeof candidate === 'string' ? candidate : null;
}

function pickLatestMessageAt(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;

  const leftAt = new Date(left).getTime();
  const rightAt = new Date(right).getTime();
  if (!Number.isFinite(leftAt)) return right;
  if (!Number.isFinite(rightAt)) return left;

  return rightAt > leftAt ? right : left;
}

function getRealtimeMessageAt(payload?: RepositoryRealtimePayload) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload.data)) {
    return payload.data.reduce<string | null>(
      (latest, item) => pickLatestMessageAt(latest, getCandidateMessageAt(item)),
      null,
    ) ?? payload.timestamp ?? null;
  }

  return getCandidateMessageAt(payload.data) ?? payload.timestamp ?? null;
}

function emitRealtimeMetric(eventName: LegacyRealtimeEventName, startedAt: number): number {
  const scheduleMs = performance.now() - startedAt;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('repo-pulse:realtime-render', {
        detail: {
          eventName,
          scheduleMs,
          budgetMs: REALTIME_INVALIDATION_BUDGET_MS,
          measuredAt: Date.now(),
        },
      }),
    );
  }

  return scheduleMs;
}

export function invalidateRepositoryRealtimeQueries(
  queryClient: RealtimeQueryClient,
  eventName: 'event:new' | 'events:new',
  payload?: RepositoryRealtimePayload,
): number {
  const startedAt = performance.now();
  const repositoryId = payload?.repositoryId;
  const messageAt = getRealtimeMessageAt(payload);

  queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
  queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.chatRepositories() });
  queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.watchFeedRoot() });
  if (repositoryId) {
    void queryClient.refetchQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          Array.isArray(key) &&
          key[0] === 'workbench' &&
          key[1] === 'conversation-messages' &&
          key[2] === repositoryId
        );
      },
      type: 'active',
    });
  } else {
    queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.conversationMessagesRoot() });
  }
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences() });

  if (repositoryId) {
    useWorkbenchUnreadStore
      .getState()
      .clearOptimisticReadIfMessageAfterRead(repositoryId, messageAt);
  }

  return emitRealtimeMetric(eventName, startedAt);
}

export function invalidateAnalysisRealtimeQueries(
  queryClient: RealtimeQueryClient,
): number {
  const startedAt = performance.now();

  queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('approval-updated'));
  }

  return emitRealtimeMetric('analysis:completed', startedAt);
}

type RealtimeEventHandlers = {
  [K in RealtimeEventName]: (payload: RealtimeEventPayloadMap[K]) => void;
};

/**
 * 实时事件处理器工厂。
 *
 * 把每个 REALTIME_EVENTS 的 React Query 失效逻辑从 socket.io 的 connect() 闭包中
 * 提升出来，使两种传输通道（web 的 socket.io、桌面端的 Electron IPC）可以共用
 * 同一套 handler，保证行为字节级一致。本函数为类型中性重构，不改变任何运行时行为。
 */
export function createRealtimeHandlers(
  queryClient: QueryClient,
  currentUserId: string | undefined,
): RealtimeEventHandlers {
  return {
    [REALTIME_EVENTS.EVENT_CREATED]: ({ repositoryId, eventType, seq, createdAt }) => {
      if (currentUserId && typeof seq === 'number' && seq > 0) {
        setLastSeq(currentUserId, repositoryId, seq);
      }
      invalidateRepositoryRealtimeQueries(queryClient, 'event:new', {
        repositoryId,
        timestamp: createdAt,
      });
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
      if (eventType.startsWith('BRANCH_')) {
        queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.branches(repositoryId) });
      }
    },
    [REALTIME_EVENTS.EVENT_REPLAY_DONE]: ({ repositoryId, replayed, hasMore, lastSeq }) => {
      if (currentUserId && lastSeq > 0) {
        setLastSeq(currentUserId, repositoryId, lastSeq);
      }
      if (replayed > 0) {
        console.log(
          `[ws] replay done repo=${repositoryId} replayed=${replayed} hasMore=${hasMore} lastSeq=${lastSeq}`,
        );
      }
    },
    [REALTIME_EVENTS.ANALYSIS_COMPLETED]: ({ eventId }) => {
      invalidateAnalysisRealtimeQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.detail(eventId) });
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.list() });
      // 分析完成时后端可能据此自动创建审批；失效审批列表/待办计数，让旁观者审批页实时出现新审批
      queryClient.invalidateQueries({ queryKey: approvalQueryKeys.all });
    },
    [REALTIME_EVENTS.ANALYSIS_STARTED]: ({ eventId }) => {
      // 分析开始：刷新分析详情/列表以反映“进行中”状态。
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.detail(eventId) });
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.list() });
    },
    [REALTIME_EVENTS.ANALYSIS_FAILED]: ({ eventId, reason }) => {
      toast.error(`AI 分析失败：${reason}`);
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.detail(eventId) });
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.list() });
    },
    [REALTIME_EVENTS.NOTIFICATION_NEW]: () => {
      // 用户级事件（无需按 repositoryId 过滤）：刷新未读数与通知列表，驱动红点。
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
    },
    [REALTIME_EVENTS.APPROVAL_UPDATED]: ({ repositoryId }) => {
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
      // 他人 approve/reject/edit 后失效审批列表/待办计数，让旁观者审批页实时刷新
      // （原仅 window.dispatchEvent('approval-updated')，但全仓库无监听者，等于空操作）
      queryClient.invalidateQueries({ queryKey: approvalQueryKeys.all });
      window.dispatchEvent(new Event('approval-updated'));
    },
    [REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS]: ({ repositoryId, jobId, progress, stage }) => {
      useSyncProgressStore.getState().update(repositoryId, { jobId, progress, stage });
    },
    [REALTIME_EVENTS.REPOSITORY_SYNCED]: ({ repositoryId, durationMs }) => {
      useSyncProgressStore.getState().clear(repositoryId);
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.chatRepositories() });
      queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.watchRepositories() });
      queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.watchFeedRoot() });
      toast.success(`同步完成（${(durationMs / 1000).toFixed(1)}s）`);
    },
    [REALTIME_EVENTS.REPOSITORY_SYNC_FAILED]: ({ repositoryId, reason }) => {
      useSyncProgressStore.getState().clear(repositoryId);
      toast.error(`同步失败：${reason}`);
    },
    [REALTIME_EVENTS.NOTIFICATION_UPDATED]: () => {
      // 同一用户已读/全部已读/删除通知后，跨标签页同步未读数与列表（驱动红点）。
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
    },
    [REALTIME_EVENTS.REPOSITORY_UPDATED]: ({ repositoryId }) => {
      // 仓库新增/更新/webhook 状态变更：刷新仓库列表/详情与概览。
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.watchRepositories() });
    },
    [REALTIME_EVENTS.REPOSITORY_DELETED]: ({ repositoryId }) => {
      // 仓库删除：刷新仓库列表/详情与概览。
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
      queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.watchRepositories() });
      queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.watchFeedRoot() });
    },
  };
}

function useSocketIoRealtimeSubscription(
  repositoryIds: string | string[] | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUserQuery();
  const socketRef = useRef<Socket | null>(null);
  const subscribedRoomsRef = useRef<Set<string>>(new Set());
  const connectTimeoutRef = useRef<number | null>(null);

  const socketNamespace = useMemo(() => getSocketUrl('/events'), []);

  const getTargetRepositoryIds = useCallback(() => {
    if (Array.isArray(repositoryIds)) {
      return repositoryIds.filter(Boolean);
    }

    return repositoryIds ? [repositoryIds] : [];
  }, [repositoryIds]);

  const syncRoomSubscriptions = useCallback(() => {
    if (!socketRef.current?.connected) {
      return;
    }

    const nextRooms = new Set(getTargetRepositoryIds());
    const userId = currentUser?.id;

    for (const id of nextRooms) {
      if (!subscribedRoomsRef.current.has(id)) {
        const sinceSeq = userId ? getLastSeq(userId, id) : undefined;
        socketRef.current.emit('join:repository', {
          repositoryId: id,
          ...(typeof sinceSeq === 'number' ? { sinceSeq } : {}),
        });
      }
    }

    for (const id of subscribedRoomsRef.current) {
      if (!nextRooms.has(id)) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
    }

    subscribedRoomsRef.current = nextRooms;
  }, [currentUser?.id, getTargetRepositoryIds]);

  const connect = useCallback(() => {
    if (!enabled || !currentUser || isAuthLoading || socketRef.current || connectTimeoutRef.current !== null) {
      return;
    }

    connectTimeoutRef.current = window.setTimeout(() => {
      connectTimeoutRef.current = null;

      const socket = io(socketNamespace, {
        path: '/socket.io',
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socket.on('connect', () => {
        syncRoomSubscriptions();
      });

      socket.on('connect_error', (error) => {
        console.warn('[socket] connect_error', error.message);
      });

      socket.on('disconnect', (reason) => {
        // 清掉本地订阅缓存，确保重连时会重新 emit join:repository
        // （否则 syncRoomSubscriptions 看到"已订阅"会跳过，后端永远收不到 join）
        subscribedRoomsRef.current = new Set();
        if (reason !== 'io client disconnect') {
          console.warn('[socket] disconnect', reason);
        }
      });

      const handlers = createRealtimeHandlers(queryClient, currentUser?.id);

      (Object.keys(handlers) as RealtimeEventName[]).forEach((eventName) => {
        socket.on(eventName, handlers[eventName] as (payload: unknown) => void);
      });

      socketRef.current = socket;
    }, 0);
  }, [enabled, currentUser, isAuthLoading, queryClient, socketNamespace, syncRoomSubscriptions]);

  const disconnect = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    subscribedRoomsRef.current = new Set();
  }, []);

  useEffect(() => {
    if (!enabled || !currentUser || isAuthLoading) {
      disconnect();
      return;
    }

    connect();
    return () => {
      disconnect();
    };
  }, [connect, currentUser, disconnect, enabled, isAuthLoading]);

  useEffect(() => {
    syncRoomSubscriptions();
  }, [syncRoomSubscriptions]);
}

/**
 * 桌面端（Electron）实时订阅：经主进程 IPC 接收实时事件，绕过浏览器 socket.io，
 * 复用与 web 完全相同的 createRealtimeHandlers 处理逻辑。
 *
 * 连接生命周期：登录后调用一次 connect（主进程保证幂等），本 hook 卸载时只取消
 * onMessage 监听，不主动 disconnect（连接绑定登录态/应用，由主进程统一管理）。
 */
function useIpcRealtimeSubscription(
  repositoryIds: string | string[] | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUserQuery();
  const subscribedRoomsRef = useRef<Set<string>>(new Set());

  const getTargetRepositoryIds = useCallback(() => {
    if (Array.isArray(repositoryIds)) {
      return repositoryIds.filter(Boolean);
    }

    return repositoryIds ? [repositoryIds] : [];
  }, [repositoryIds]);

  const leaveAllRooms = useCallback(() => {
    const bridge = window.repoPulseDesktop?.realtime;
    for (const id of subscribedRoomsRef.current) {
      void bridge?.leave({ repositoryId: id });
    }
    subscribedRoomsRef.current = new Set();
  }, []);

  useEffect(() => {
    if (!enabled || !currentUser || isAuthLoading) {
      return;
    }

    const bridge = window.repoPulseDesktop?.realtime;
    if (!bridge) {
      return;
    }

    const handlers = createRealtimeHandlers(queryClient, currentUser.id);
    const unsubscribe = bridge.onMessage((message) => {
      if (import.meta.env.DEV) {
        console.log('[ipc-realtime] recv', message.name);
      }
      // 本地 git 事件（仅桌面）：刷新仓库详情/分支，并派发窗口事件供 GitTreePanel 重载。
      if (message.name === DESKTOP_LOCAL_EVENTS.LOCAL_GIT_CHANGED) {
        const { repositoryId } = message.payload;
        queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
        queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.branches(repositoryId) });
        window.dispatchEvent(
          new CustomEvent('repo-pulse:local-git-changed', { detail: message.payload }),
        );
        return;
      }
      (handlers[message.name] as (payload: unknown) => void)(message.payload);
    });

    void bridge.connect();

    return () => {
      unsubscribe();
    };
  }, [enabled, currentUser, isAuthLoading, queryClient]);

  useEffect(() => {
    if (enabled && currentUser && !isAuthLoading) {
      return;
    }
    leaveAllRooms();
  }, [currentUser, enabled, isAuthLoading, leaveAllRooms]);

  useEffect(() => {
    if (!enabled || !currentUser || isAuthLoading) {
      return;
    }

    const bridge = window.repoPulseDesktop?.realtime;
    if (!bridge) {
      return;
    }

    const userId = currentUser.id;
    const nextRooms = new Set(getTargetRepositoryIds());

    for (const id of nextRooms) {
      if (!subscribedRoomsRef.current.has(id)) {
        const sinceSeq = getLastSeq(userId, id);
        void bridge.subscribe(
          typeof sinceSeq === 'number'
            ? { repositoryId: id, sinceSeq }
            : { repositoryId: id },
        );
      }
    }

    for (const id of subscribedRoomsRef.current) {
      if (!nextRooms.has(id)) {
        void bridge.leave({ repositoryId: id });
      }
    }

    subscribedRoomsRef.current = nextRooms;
  }, [enabled, currentUser, isAuthLoading, getTargetRepositoryIds]);

  useEffect(() => leaveAllRooms, [leaveAllRooms]);
}

/**
 * 仓库实时订阅。桌面端走 Electron IPC（主进程持有唯一连接），其余环境走 socket.io。
 * 两条分支互斥，共用同一套 React Query 失效逻辑（createRealtimeHandlers）。
 */
export function useRepositoryRealtimeSubscription(repositoryIds?: string | string[]) {
  const isDesktop = isDesktopRuntime();
  useSocketIoRealtimeSubscription(repositoryIds, !isDesktop);
  useIpcRealtimeSubscription(repositoryIds, isDesktop);
}
