import { apiClient } from './api-client';

function buildDashboardParams(
  repositoryIds?: string[],
  params?: Record<string, number | string>,
) {
  return {
    ...params,
    ...(repositoryIds && repositoryIds.length > 0
      ? { repositoryIds: [...repositoryIds].sort().join(',') }
      : {}),
  };
}

export interface DashboardOverview {
  totalRepositories: number;
  openPRs: number;
  commitsToday: number;
  openIssues: number;
}

export interface DashboardActivity {
  date: string;
  commits: number;
  prs: number;
  issues: number;
}

export interface DashboardRecentActivity {
  id: string;
  type: string;
  action: string;
  title: string;
  author: string;
  repo: string;
  occurredAt: string | null;
  time: string;
}

class DashboardService {
  async getOverview(repositoryIds?: string[]): Promise<DashboardOverview> {
    const response = await apiClient.get<{ data: DashboardOverview }>('/dashboard/overview', {
      params: buildDashboardParams(repositoryIds),
    });
    return response.data.data;
  }

  async getActivity(days: number = 7, repositoryIds?: string[]): Promise<DashboardActivity[]> {
    const response = await apiClient.get<{ data: DashboardActivity[] }>('/dashboard/activity', {
      params: buildDashboardParams(repositoryIds, { days }),
    });
    return response.data.data;
  }

  async getRecentActivity(limit: number = 10, repositoryIds?: string[]): Promise<DashboardRecentActivity[]> {
    const response = await apiClient.get<{ data: DashboardRecentActivity[] }>('/dashboard/recent-activity', {
      params: buildDashboardParams(repositoryIds, { limit }),
    });
    return response.data.data;
  }
}

export const dashboardService = new DashboardService();
