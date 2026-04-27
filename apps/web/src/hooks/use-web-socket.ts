import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';

interface EventPayload {
  type: 'event:new';
  repositoryId: string;
  data: unknown;
  timestamp: string;
}

export function useRepositoryRealtimeSubscription(repositoryIds?: string | string[]) {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUserQuery();
  const socketRef = useRef<Socket | null>(null);
  const subscribedRoomsRef = useRef<Set<string>>(new Set());
  const connectTimeoutRef = useRef<number | null>(null);

  const socketNamespace = useMemo(() => '/events', []);

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

      socket.on('event:new', (payload: EventPayload) => {
        queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all });
        queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() });
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences() });

        if (payload.repositoryId) {
          queryClient.invalidateQueries({
            queryKey: dashboardQueryKeys.stats(payload.repositoryId),
          });
          queryClient.invalidateQueries({
            queryKey: dashboardQueryKeys.recentEvents(payload.repositoryId),
          });
        }
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
