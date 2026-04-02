import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';

export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => dashboardService.getOverview(),
  });
}

export function useDashboardActivity(days: number = 7) {
  return useQuery({
    queryKey: ['dashboard', 'activity', days],
    queryFn: () => dashboardService.getActivity(days),
  });
}

export function useDashboardRecentActivity(limit: number = 10) {
  return useQuery({
    queryKey: ['dashboard', 'recent-activity', limit],
    queryFn: () => dashboardService.getRecentActivity(limit),
  });
}
