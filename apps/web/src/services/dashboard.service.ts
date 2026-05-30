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
  branch: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  branches: string[];
  occurredAt: string | null;
  time: string;
}

export interface ProjectRiverDailyRow {
  date: string;
  contributor: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  filesTouched: number;
  cumulativeCommits: number;
}

export type ProjectRiverKeyNodeType =
  | 'contributor_first_commit'
  | 'contributor_exit'
  | 'activity_spike'
  | 'activity_drop'
  | 'major_refactor'
  | 'commit_milestone'
  | 'project_start'
  | 'project_archived';

export type ProjectRiverSeverity = 'info' | 'positive' | 'warning';

export interface ProjectRiverKeyNode {
  id: string;
  type: ProjectRiverKeyNodeType;
  date: string;
  severity: ProjectRiverSeverity;
  priority?: number;
  impactScore: number;
  titleKey: string;
  descriptionKey: string;
  params: Record<string, string | number>;
  contributors?: string[];
}

export interface ProjectRiverEventMarker {
  id: string;
  date: string;
  title: string;
  description: string;
  type: 'push' | 'pull_request' | 'issue' | 'release' | 'security' | 'other';
  severity: ProjectRiverSeverity;
  externalUrl: string | null;
  source: 'event';
}

export interface ProjectRiverDashboardData {
  repositoryId: string;
  generatedAt: string;
  source: 'event_store';
  dailyRows: ProjectRiverDailyRow[];
  keyNodes: ProjectRiverKeyNode[];
  eventMarkers: ProjectRiverEventMarker[];
  summary: {
    totalCommits: number;
    totalContributors: number;
    totalEvents: number;
    analyzedEvents: number;
    isTruncated: boolean;
    latestEventAt: string | null;
  };
  cache: {
    status: 'hit' | 'miss';
    ttlMs: number;
    expiresAt: string;
    fingerprint: string;
  };
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

  async getProjectRiverRepositoryDashboard(
    repositoryId: string,
    repositoryBranchScopes?: RepositoryBranchScopeMap,
  ): Promise<ProjectRiverDashboardData> {
    const response = await apiClient.get<{ data: ProjectRiverDashboardData }>(
      `/dashboard/project-river/${repositoryId}`,
      {
        params: buildDashboardParams([repositoryId], repositoryBranchScopes),
      },
    );
    return response.data.data;
  }
}

export const dashboardService = new DashboardService();
