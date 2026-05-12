import { approvalService } from '@/services/approval.service';
import { eventService } from '@/services/event.service';
import { notificationService } from '@/services/notification.service';
import { repositoryService } from '@/services/repository.service';
import { useApiQuery } from '@/lib/query-hooks';
import type { RepositoryBranchScopeMap } from '@/types/api';

function createSelectionKey(
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  if (!repositoryIds || repositoryIds.length === 0) {
    return 'none';
  }

  const normalizedBranchScopes = repositoryIds.reduce<Record<string, string[]>>((acc, repositoryId) => {
    const branches = repositoryBranchScopes?.[repositoryId] ?? [];
    if (branches.length > 0) {
      acc[repositoryId] = [...branches].sort();
    }
    return acc;
  }, {});

  return JSON.stringify({
    repositoryIds: [...repositoryIds].sort(),
    repositoryBranchScopes: normalizedBranchScopes,
  });
}

export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  repositories: () => [...dashboardQueryKeys.all, 'repositories'] as const,
  stats: (selectionKey: string) => [...dashboardQueryKeys.all, 'stats', selectionKey] as const,
  recentEvents: (selectionKey: string) => [...dashboardQueryKeys.all, 'recent-events', selectionKey] as const,
  pendingApprovals: (selectionKey: string) =>
    [...dashboardQueryKeys.all, 'pending-approvals', selectionKey] as const,
  unreadNotifications: (selectionKey: string) =>
    [...dashboardQueryKeys.all, 'unread-notifications', selectionKey] as const,
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

export function useDashboardStatsQuery(
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const selectionKey = createSelectionKey(repositoryIds, repositoryBranchScopes);

  return useApiQuery({
    queryKey: dashboardQueryKeys.stats(selectionKey),
    queryFn: async () => {
      try {
        return await eventService.getStats(repositoryIds ?? [], repositoryBranchScopes);
      } catch {
        return {
          total: 0,
          byType: [],
        };
      }
    },
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
    staleTime: 60 * 1000,
  });
}

export function useDashboardRecentEventsQuery(
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const selectionKey = createSelectionKey(repositoryIds, repositoryBranchScopes);

  return useApiQuery({
    queryKey: dashboardQueryKeys.recentEvents(selectionKey),
    queryFn: async () => {
      try {
        return await eventService.getAll(repositoryIds ?? [], repositoryBranchScopes, {
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
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
    staleTime: 30 * 1000,
  });
}

export function usePendingApprovalsCountQuery(
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const selectionKey = createSelectionKey(repositoryIds, repositoryBranchScopes);

  return useApiQuery({
    queryKey: dashboardQueryKeys.pendingApprovals(selectionKey),
    queryFn: () => approvalService.getPendingCount(repositoryIds, repositoryBranchScopes),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
    staleTime: 30 * 1000,
  });
}

export function useUnreadNotificationsCountQuery(
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const selectionKey = createSelectionKey(repositoryIds, repositoryBranchScopes);

  return useApiQuery({
    queryKey: dashboardQueryKeys.unreadNotifications(selectionKey),
    queryFn: () => notificationService.getUnreadCount(repositoryIds, repositoryBranchScopes),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
    staleTime: 30 * 1000,
  });
}
