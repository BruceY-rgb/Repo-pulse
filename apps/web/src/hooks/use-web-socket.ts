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
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const socketUrl = useMemo(() => 'http://localhost:3001/events', []);

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
      if (!nextRooms.has(id) && socketRef.current?.connected) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
    }

    subscribedRoomsRef.current = nextRooms;
  }, [getTargetRepositoryIds]);

  const connect = useCallback(() => {
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    if (socketRef.current) {
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
      return;
    }

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

    socket.on('connect', () => {
      syncRoomSubscriptions();
    });

    socketRef.current = socket;
  }, [queryClient, socketUrl, syncRoomSubscriptions]);

  const disconnect = useCallback(() => {
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
    }

    // React.StrictMode 在开发环境会触发一次“挂载-卸载-再挂载”，延迟断开可避免误判为提前关闭。
    disconnectTimerRef.current = setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      subscribedRoomsRef.current = new Set();
      disconnectTimerRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    syncRoomSubscriptions();
  }, [syncRoomSubscriptions]);
}