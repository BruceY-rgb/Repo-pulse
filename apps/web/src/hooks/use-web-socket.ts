import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';

interface EventPayload {
  type: 'event:new';
  repositoryId: string;
  data: unknown;
  timestamp: string;
}

export function useRepositoryRealtimeSubscription(repositoryIds?: string | string[]) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const subscribedRoomsRef = useRef<Set<string>>(new Set());

  const socketUrl = useMemo(() => 'http://localhost:3001/events', []);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    const socket = io(socketUrl, {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
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
  }, [queryClient, socketUrl]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    if (!socketRef.current?.connected) {
      return;
    }

    const targetRepositoryIds = Array.isArray(repositoryIds)
      ? repositoryIds
      : repositoryIds
        ? [repositoryIds]
        : [];
    const nextRooms = new Set(targetRepositoryIds.filter(Boolean));

    for (const id of nextRooms) {
      if (!subscribedRoomsRef.current.has(id)) {
        socketRef.current.emit('join:repository', { repositoryId: id });
      }
    }

    for (const id of subscribedRoomsRef.current) {
      if (!nextRooms.has(id) && socketRef.current?.connected) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
    }

    subscribedRoomsRef.current = nextRooms;

    return () => {
      if (!socketRef.current?.connected) {
        return;
      }

      for (const id of subscribedRoomsRef.current) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
      subscribedRoomsRef.current = new Set();
    };
  }, [repositoryIds]);
}