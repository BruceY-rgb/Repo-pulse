import { approvalService } from '@/services/approval.service';
import { eventService } from '@/services/event.service';
import { notificationService } from '@/services/notification.service';
import { repositoryService } from '@/services/repository.service';
import { useApiQuery } from '@/lib/query-hooks';

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  repositories: () => [...dashboardQueryKeys.all, 'repositories'] as const,
  stats: (repositoryId: string) => [...dashboardQueryKeys.all, 'stats', repositoryId] as const,
  recentEvents: (repositoryId: string) => [...dashboardQueryKeys.all, 'recent-events', repositoryId] as const,
  pendingApprovals: () => [...dashboardQueryKeys.all, 'pending-approvals'] as const,
  unreadNotifications: () => [...dashboardQueryKeys.all, 'unread-notifications'] as const,
};

export function useDashboardRepositoriesQuery() {
  return useApiQuery({
    queryKey: dashboardQueryKeys.repositories(),
    queryFn: async () => {
      try {
        const repositories = await repositoryService.getAll();
        return repositories.filter((repository) => repository.isActive);
      } catch {
        return [];
      }
    },
    staleTime: 60 * 1000,
  });
}

export function useDashboardStatsQuery(repositoryId?: string) {
  return useApiQuery({
    queryKey: dashboardQueryKeys.stats(repositoryId ?? 'none'),
    queryFn: () => eventService.getStats(repositoryId ?? ''),
    enabled: Boolean(repositoryId),
    staleTime: 60 * 1000,
  });
}

export function useDashboardRecentEventsQuery(repositoryId?: string) {
  return useApiQuery({
    queryKey: dashboardQueryKeys.recentEvents(repositoryId ?? 'none'),
    queryFn: () =>
      repositoryService.getEvents(repositoryId ?? '', {
        page: 1,
        pageSize: 6,
      }),
    enabled: Boolean(repositoryId),
    staleTime: 30 * 1000,
  });
}

export function usePendingApprovalsCountQuery() {
  return useApiQuery({
    queryKey: dashboardQueryKeys.pendingApprovals(),
    queryFn: approvalService.getPendingCount,
    staleTime: 30 * 1000,
  });
}

export function useUnreadNotificationsCountQuery() {
  return useApiQuery({
    queryKey: dashboardQueryKeys.unreadNotifications(),
    queryFn: notificationService.getUnreadCount,
    staleTime: 30 * 1000,
  });
}
