import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService, type NotificationPreferences } from '@/services/notification.service';

// Query Keys
export const notificationKeys = {
  all: ['notifications'] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...notificationKeys.lists(), filters] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

// Queries
export function useNotificationPreferences() {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: () => notificationService.getPreferences(),
    retry: false,
    throwOnError: false,
  });
}

export function useNotifications(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: notificationKeys.list(options || {}),
    queryFn: () => notificationService.getNotifications(options),
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationService.getUnreadCount(),
    refetchInterval: 30000, // 每 30 秒轮询
  });
}

// Mutations
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (prefs: Partial<NotificationPreferences>) =>
      notificationService.updatePreferences(prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.preferences() });
    },
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationService.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => notificationService.deleteNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}