import { apiClient } from './api-client';

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
  time: string;
}

class DashboardService {
  async getOverview(): Promise<DashboardOverview> {
    const response = await apiClient.get<{ data: DashboardOverview }>('/dashboard/overview');
    return response.data.data;
  }

  async getActivity(days: number = 7): Promise<DashboardActivity[]> {
    const response = await apiClient.get<{ data: DashboardActivity[] }>('/dashboard/activity', {
      params: { days },
    });
    return response.data.data;
  }

  async getRecentActivity(limit: number = 10): Promise<DashboardRecentActivity[]> {
    const response = await apiClient.get<{ data: DashboardRecentActivity[] }>('/dashboard/recent-activity', {
      params: { limit },
    });
    return response.data.data;
  }
}

export const dashboardService = new DashboardService();
