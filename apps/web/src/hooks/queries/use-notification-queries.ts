import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation, useApiQuery } from '@/lib/query-hooks';
import {
  notificationService,
  type NotificationPreferences,
} from '@/services/notification.service';

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationQueryKeys.all, 'list'] as const,
  unreadCount: () => [...notificationQueryKeys.all, 'unread-count'] as const,
  preferences: () => [...notificationQueryKeys.all, 'preferences'] as const,
};

export function useNotificationsQuery() {
  return useApiQuery({
    queryKey: notificationQueryKeys.list(),
    queryFn: () => notificationService.getNotifications({ limit: 50, offset: 0 }),
    staleTime: 15 * 1000,
  });
}

export function useUnreadNotificationCountQuery() {
  return useApiQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: notificationService.getUnreadCount,
    staleTime: 15 * 1000,
  });
}

export function useNotificationPreferencesQuery() {
  return useApiQuery({
    queryKey: notificationQueryKeys.preferences(),
    queryFn: notificationService.getPreferences,
    staleTime: 30 * 1000,
  });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...notificationQueryKeys.all, 'mark-read'],
    mutationFn: (notificationId: string) => notificationService.markAsRead(notificationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
      ]);
    },
  });
}

export function useMarkAllNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...notificationQueryKeys.all, 'mark-all-read'],
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
      ]);
    },
  });
}

export function useDeleteNotificationMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...notificationQueryKeys.all, 'delete'],
    mutationFn: (notificationId: string) => notificationService.deleteNotification(notificationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: notificationQueryKeys.all }),
      ]);
    },
  });
}

export function useUpdateNotificationPreferencesMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...notificationQueryKeys.all, 'update-preferences'],
    mutationFn: (payload: Partial<NotificationPreferences>) =>
      notificationService.updatePreferences(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences() });
    },
  });
}
