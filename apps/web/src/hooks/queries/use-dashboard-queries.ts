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
    queryFn: async () => {
      try {
        const result = await eventService.getAll(repositoryId ?? '', {
          page: 1,
          pageSize: 200,
        });

        const byTypeMap = result.items.reduce<Record<string, number>>((acc, item) => {
          acc[item.type] = (acc[item.type] ?? 0) + 1;
          return acc;
        }, {});

        return {
          total: result.total,
          byType: Object.entries(byTypeMap).map(([type, count]) => ({
            type,
            count,
          })),
        };
      } catch {
        return {
          total: 0,
          byType: [],
        };
      }
    },
    enabled: Boolean(repositoryId),
    staleTime: 60 * 1000,
  });
}

export function useDashboardRecentEventsQuery(repositoryId?: string) {
  return useApiQuery({
    queryKey: dashboardQueryKeys.recentEvents(repositoryId ?? 'none'),
    queryFn: async () => {
      try {
        return await repositoryService.getEvents(repositoryId ?? '', {
          page: 1,
          pageSize: 6,
        });
      } catch {
        return {
          items: [],
          total: 0,
          page: 1,
          pageSize: 6,
          totalPages: 0,
        };
      }
    },
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
