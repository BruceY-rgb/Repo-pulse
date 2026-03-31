import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { eventKeys } from './use-events';
import { repositoryKeys } from './use-repositories';

interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
}

interface WebSocketEvent {
  type: string;
  repositoryId: string;
  data: unknown;
}

/**
 * WebSocket Hook - 管理 WebSocket 连接和事件订阅
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { url = 'http://localhost:3001', autoConnect = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const connectedRef = useRef(false);

  // 连接 WebSocket
  const connect = useCallback((token?: string) => {
    if (socketRef.current?.connected) {
      return;
    }

    const socket = io(`${url}/events`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[WebSocket] Connected:', socket.id);
      connectedRef.current = true;
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
      connectedRef.current = false;
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
    });

    // 监听新事件推送
    socket.on('event:new', (event: WebSocketEvent) => {
      console.log('[WebSocket] Received new event:', event);

      // 使事件相关查询失效
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
      queryClient.invalidateQueries({
        queryKey: repositoryKeys.detail(event.repositoryId),
      });
    });

    socketRef.current = socket;
  }, [url, queryClient]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      connectedRef.current = false;
    }
  }, []);

  // 订阅仓库
  const joinRoom = useCallback((repositoryId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('join:repository', { repositoryId });
      console.log('[WebSocket] Joined room:', repositoryId);
    }
  }, []);

  // 取消订阅
  const leaveRoom = useCallback((repositoryId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave:repository', { repositoryId });
      console.log('[WebSocket] Left room:', repositoryId);
    }
  }, []);

  // 自动连接
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected: connectedRef.current,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
  };
}

/**
 * 便捷 Hook - 用于页面级别的 WebSocket 订阅
 */
export function useRepositorySubscription(repositoryId: string) {
  const { joinRoom, leaveRoom, isConnected } = useWebSocket();

  useEffect(() => {
    if (repositoryId && isConnected) {
      joinRoom(repositoryId);
      return () => {
        leaveRoom(repositoryId);
      };
    }
  }, [repositoryId, isConnected, joinRoom, leaveRoom]);
}