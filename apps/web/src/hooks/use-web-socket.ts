import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';
import { analysisQueryKeys } from '@/hooks/use-analysis';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { getSocketUrl } from '@/lib/desktop';

export const REALTIME_INVALIDATION_BUDGET_MS = 50;

type RealtimeEventName = 'event:new' | 'events:new' | 'analysis:completed';
type RealtimeQueryClient = Pick<QueryClient, 'invalidateQueries'>;

function emitRealtimeMetric(eventName: RealtimeEventName, startedAt: number): number {
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
): number {
  const startedAt = performance.now();

  queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
  queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences() });

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

    for (const id of nextRooms) {
      if (!subscribedRoomsRef.current.has(id)) {
        socketRef.current.emit('join:repository', { repositoryId: id });
      }
    }

    for (const id of subscribedRoomsRef.current) {
      if (!nextRooms.has(id)) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
    }

    subscribedRoomsRef.current = nextRooms;
  }, [getTargetRepositoryIds]);

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
        if (reason !== 'io client disconnect') {
          console.warn('[socket] disconnect', reason);
        }
      });

      socket.on('event:new', () => {
        invalidateRepositoryRealtimeQueries(queryClient, 'event:new');
      });

      socket.on('events:new', () => {
        invalidateRepositoryRealtimeQueries(queryClient, 'events:new');
      });

      socket.on('analysis:completed', () => {
        invalidateAnalysisRealtimeQueries(queryClient);
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
