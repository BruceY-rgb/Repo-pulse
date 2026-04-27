import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';

function createSelectionKey(repositoryIds?: string[]) {
  if (!repositoryIds || repositoryIds.length === 0) {
    return 'none';
  }

  return [...repositoryIds].sort().join(',');
}

export function useDashboardOverview(repositoryIds?: string[]) {
  const selectionKey = createSelectionKey(repositoryIds);

  return useQuery({
    queryKey: ['dashboard', 'overview', selectionKey],
    queryFn: () => dashboardService.getOverview(repositoryIds),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
  });
}

export function useDashboardActivity(days: number = 7, repositoryIds?: string[]) {
  const selectionKey = createSelectionKey(repositoryIds);

  return useQuery({
    queryKey: ['dashboard', 'activity', days, selectionKey],
    queryFn: () => dashboardService.getActivity(days, repositoryIds),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
  });
}

export function useDashboardRecentActivity(limit: number = 10, repositoryIds?: string[]) {
  const selectionKey = createSelectionKey(repositoryIds);

  return useQuery({
    queryKey: ['dashboard', 'recent-activity', limit, selectionKey],
    queryFn: () => dashboardService.getRecentActivity(limit, repositoryIds),
    enabled: Boolean(repositoryIds && repositoryIds.length > 0),
  });
}
