import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  REALTIME_EVENTS,
  type RealtimeEventName,
  type RealtimeEventPayloadMap,
} from '@repo-pulse/shared';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';
import { workbenchQueryKeys } from '@/hooks/queries/use-workbench-queries';
import { analysisQueryKeys } from '@/hooks/use-analysis';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { useSyncProgressStore } from '@/stores/sync-progress.store';
import { getSocketUrl } from '@/lib/desktop';
import { useWorkbenchUnreadStore } from '@/stores/workbench-unread.store';
import { getLastSeq, setLastSeq } from '@/lib/event-seq';

export const REALTIME_INVALIDATION_BUDGET_MS = 50;

type LegacyRealtimeEventName = 'event:new' | 'events:new' | 'analysis:completed';
type RealtimeQueryClient = Pick<QueryClient, 'invalidateQueries'>;

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
  queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.conversationMessagesRoot() });
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

export function useRepositoryRealtimeSubscription(repositoryIds?: string | string[]) {
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
    if (!currentUser || isAuthLoading || socketRef.current || connectTimeoutRef.current !== null) {
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

      const handlers: RealtimeEventHandlers = {
        [REALTIME_EVENTS.EVENT_CREATED]: ({ repositoryId, eventType, seq, createdAt }) => {
          if (currentUser?.id && typeof seq === 'number' && seq > 0) {
            setLastSeq(currentUser.id, repositoryId, seq);
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
          if (currentUser?.id && lastSeq > 0) {
            setLastSeq(currentUser.id, repositoryId, lastSeq);
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
        },
        [REALTIME_EVENTS.APPROVAL_UPDATED]: ({ repositoryId }) => {
          queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
          queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
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
          toast.success(`同步完成（${(durationMs / 1000).toFixed(1)}s）`);
        },
        [REALTIME_EVENTS.REPOSITORY_SYNC_FAILED]: ({ repositoryId, reason }) => {
          useSyncProgressStore.getState().clear(repositoryId);
          toast.error(`同步失败：${reason}`);
        },
      };

      (Object.keys(handlers) as RealtimeEventName[]).forEach((eventName) => {
        socket.on(eventName, handlers[eventName] as (payload: unknown) => void);
      });

      socketRef.current = socket;
    }, 0);
  }, [currentUser, isAuthLoading, queryClient, socketNamespace, syncRoomSubscriptions]);

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
    if (!currentUser || isAuthLoading) {
      disconnect();
      return;
    }

    connect();
    return () => {
      disconnect();
    };
  }, [connect, currentUser, disconnect, isAuthLoading]);

  useEffect(() => {
    syncRoomSubscriptions();

    return () => {
      if (!socketRef.current?.connected) {
        return;
      }

      for (const id of subscribedRoomsRef.current) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
      subscribedRoomsRef.current = new Set();
    };
  }, [syncRoomSubscriptions]);
}
