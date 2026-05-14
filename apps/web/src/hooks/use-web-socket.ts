import { useEffect, useId, useMemo } from 'react';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';
import { analysisQueryKeys } from '@/hooks/use-analysis';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';

const socketNamespace = '/events';

let sharedSocket: Socket | null = null;
let sharedSocketUserId: string | null = null;
let connectTimeoutId: number | null = null;
let activeQueryClient: QueryClient | null = null;

const roomSubscriptions = new Map<string, Set<string>>();
let subscribedRooms = new Set<string>();

function getNextRooms() {
  const nextRooms = new Set<string>();

  for (const rooms of roomSubscriptions.values()) {
    for (const room of rooms) {
      nextRooms.add(room);
    }
  }

  return nextRooms;
}

function syncRoomSubscriptions() {
  if (!sharedSocket?.connected) {
    return;
  }

  const nextRooms = getNextRooms();

  for (const id of nextRooms) {
    if (!subscribedRooms.has(id)) {
      sharedSocket.emit('join:repository', { repositoryId: id });
    }
  }

  for (const id of subscribedRooms) {
    if (!nextRooms.has(id)) {
      sharedSocket.emit('leave:repository', { repositoryId: id });
    }
  }

  subscribedRooms = nextRooms;
}

function disconnectSharedSocket() {
  if (connectTimeoutId !== null) {
    window.clearTimeout(connectTimeoutId);
    connectTimeoutId = null;
  }

  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
  }

  sharedSocketUserId = null;
  subscribedRooms = new Set();
}

function connectSharedSocket(queryClient: QueryClient, userId: string) {
  activeQueryClient = queryClient;

  if (sharedSocketUserId && sharedSocketUserId !== userId) {
    disconnectSharedSocket();
  }

  if (sharedSocket || connectTimeoutId !== null) {
    return;
  }

  sharedSocketUserId = userId;
  connectTimeoutId = window.setTimeout(() => {
    connectTimeoutId = null;

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
      activeQueryClient?.invalidateQueries({ queryKey: dashboardQueryKeys.all });
      activeQueryClient?.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
      activeQueryClient?.invalidateQueries({ queryKey: notificationQueryKeys.list() });
      activeQueryClient?.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
      activeQueryClient?.invalidateQueries({ queryKey: notificationQueryKeys.preferences() });
    });

    socket.on('analysis:completed', () => {
      activeQueryClient?.invalidateQueries({ queryKey: analysisQueryKeys.all });
      activeQueryClient?.invalidateQueries({ queryKey: notificationQueryKeys.list() });
      activeQueryClient?.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() });
      activeQueryClient?.invalidateQueries({ queryKey: notificationQueryKeys.preferences() });
      window.dispatchEvent(new Event('approval-updated'));
    });

    sharedSocket = socket;
  }, 0);
}

export function useRepositoryRealtimeSubscription(repositoryIds?: string | string[]) {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUserQuery();
  const subscriptionId = useId();

  const targetRepositoryIds = useMemo(() => {
    if (Array.isArray(repositoryIds)) {
      return repositoryIds.filter(Boolean);
    }

    return repositoryIds ? [repositoryIds] : [];
  }, [repositoryIds]);

  useEffect(() => {
    if (!currentUser || isAuthLoading) {
      roomSubscriptions.delete(subscriptionId);
      syncRoomSubscriptions();

      if (roomSubscriptions.size === 0) {
        disconnectSharedSocket();
      }

      return;
    }

    roomSubscriptions.set(subscriptionId, new Set(targetRepositoryIds));
    connectSharedSocket(queryClient, currentUser.id);
    syncRoomSubscriptions();

    return () => {
      roomSubscriptions.delete(subscriptionId);
      syncRoomSubscriptions();

      if (roomSubscriptions.size === 0) {
        disconnectSharedSocket();
      }
    };
  }, [currentUser, isAuthLoading, queryClient, subscriptionId, targetRepositoryIds]);
}
