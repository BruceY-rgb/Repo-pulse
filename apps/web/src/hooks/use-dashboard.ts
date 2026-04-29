import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
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

export function useDashboardOverview(
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const selectionKey = createSelectionKey(repositoryIds, repositoryBranchScopes);

  return useQuery({
    queryKey: ['dashboard', 'overview', selectionKey],
    queryFn: () => dashboardService.getOverview(repositoryIds, repositoryBranchScopes),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
  });
}

export function useDashboardActivity(
  days: number = 7,
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const selectionKey = createSelectionKey(repositoryIds, repositoryBranchScopes);

  return useQuery({
    queryKey: ['dashboard', 'activity', days, selectionKey],
    queryFn: () => dashboardService.getActivity(days, repositoryIds, repositoryBranchScopes),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
  });
}

export function useDashboardRecentActivity(
  limit: number = 10,
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const selectionKey = createSelectionKey(repositoryIds, repositoryBranchScopes);

  return useQuery({
    queryKey: ['dashboard', 'recent-activity', limit, selectionKey],
    queryFn: () => dashboardService.getRecentActivity(limit, repositoryIds, repositoryBranchScopes),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
  });
}
