import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  REALTIME_EVENTS,
  type RealtimeEventName,
  type RealtimeEventPayloadMap,
} from '@repo-pulse/shared';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';
import { analysisQueryKeys } from '@/hooks/use-analysis';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { getSocketUrl } from '@/lib/desktop';

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

      const handlers: RealtimeEventHandlers = {
        [REALTIME_EVENTS.EVENT_CREATED]: ({ repositoryId, eventType }) => {
          queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
          queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
          if (eventType.startsWith('BRANCH_')) {
            queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.branches(repositoryId) });
          }
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
        },
        [REALTIME_EVENTS.ANALYSIS_COMPLETED]: ({ eventId }) => {
          queryClient.invalidateQueries({ queryKey: analysisQueryKeys.detail(eventId) });
          queryClient.invalidateQueries({ queryKey: analysisQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
          window.dispatchEvent(new Event('approval-updated'));
        },
        [REALTIME_EVENTS.APPROVAL_UPDATED]: ({ repositoryId }) => {
          queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
          queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
          queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
          window.dispatchEvent(new Event('approval-updated'));
        },
        [REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS]: (payload) => {
          // TODO M2: 同步按钮订阅进度更新本地状态
          console.log('[ws] repository.sync.progress received (placeholder)', payload);
        },
        [REALTIME_EVENTS.REPOSITORY_SYNCED]: (payload) => {
          // TODO M2: 同步完成清理本地状态 + 精准失效该仓库
          console.log('[ws] repository.synced received (placeholder)', payload);
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
