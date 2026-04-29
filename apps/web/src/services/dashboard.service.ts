import { apiClient } from './api-client';
import type { RepositoryBranchScopeMap } from '@/types/api';

function buildDashboardParams(
  repositoryIds?: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
  params?: Record<string, number | string>,
) {
  const normalizedBranchScopes = repositoryIds?.reduce<Record<string, string[]>>((acc, repositoryId) => {
    const branches = repositoryBranchScopes?.[repositoryId] ?? [];
    if (branches.length > 0) {
      acc[repositoryId] = [...branches].sort();
    }
    return acc;
  }, {});

  return {
    ...params,
    ...(repositoryIds && repositoryIds.length > 0
      ? { repositoryIds: [...repositoryIds].sort().join(',') }
      : {}),
    ...(normalizedBranchScopes && Object.keys(normalizedBranchScopes).length > 0
      ? { branchScopes: JSON.stringify(normalizedBranchScopes) }
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
  time: string;
}

class DashboardService {
  async getOverview(
    repositoryIds?: string[],
    repositoryBranchScopes?: RepositoryBranchScopeMap,
  ): Promise<DashboardOverview> {
    const response = await apiClient.get<{ data: DashboardOverview }>('/dashboard/overview', {
      params: buildDashboardParams(repositoryIds, repositoryBranchScopes),
    });
    return response.data.data;
  }

  async getActivity(
    days: number = 7,
    repositoryIds?: string[],
    repositoryBranchScopes?: RepositoryBranchScopeMap,
  ): Promise<DashboardActivity[]> {
    const response = await apiClient.get<{ data: DashboardActivity[] }>('/dashboard/activity', {
      params: buildDashboardParams(repositoryIds, repositoryBranchScopes, { days }),
    });
    return response.data.data;
  }

  async getRecentActivity(
    limit: number = 10,
    repositoryIds?: string[],
    repositoryBranchScopes?: RepositoryBranchScopeMap,
  ): Promise<DashboardRecentActivity[]> {
    const response = await apiClient.get<{ data: DashboardRecentActivity[] }>('/dashboard/recent-activity', {
      params: buildDashboardParams(repositoryIds, repositoryBranchScopes, { limit }),
    });
    return response.data.data;
  }
}

export const dashboardService = new DashboardService();
