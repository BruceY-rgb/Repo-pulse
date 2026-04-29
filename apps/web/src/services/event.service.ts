import { apiClient } from './api-client';
import type {
  ApiResponse,
  PaginatedResponse,
  Event,
  RepositoryBranchScopeMap,
} from '@/types/api';

export interface EventStats {
  total: number;
  byType: Array<{
    type: string;
    count: number;
  }>;
}

function serializeRepositoryIds(repositoryIds: string[]) {
  return [...repositoryIds].sort().join(',');
}

function serializeBranchScopes(
  repositoryIds: string[],
  repositoryBranchScopes?: RepositoryBranchScopeMap,
) {
  const scopedEntries = repositoryIds.flatMap((repositoryId) => {
    const branches = repositoryBranchScopes?.[repositoryId] ?? [];
    return branches.length > 0
      ? [[repositoryId, [...branches].sort()] as const]
      : [];
  });

  if (scopedEntries.length === 0) {
    return undefined;
  }

  return JSON.stringify(Object.fromEntries(scopedEntries));
}

export const eventService = {
  async getAll(
    repositoryIds: string[],
    repositoryBranchScopes?: RepositoryBranchScopeMap,
    options?: {
      page?: number;
      pageSize?: number;
      type?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<PaginatedResponse<Event>> {
    const { data } = await apiClient.get<ApiResponse<PaginatedResponse<Event>>>('/events', {
      params: {
        repositoryIds: serializeRepositoryIds(repositoryIds),
        branchScopes: serializeBranchScopes(repositoryIds, repositoryBranchScopes),
        ...options,
      },
    });
    return data.data;
  },

  async getById(id: string): Promise<Event> {
    const { data } = await apiClient.get<ApiResponse<Event>>(`/events/${id}`);
    return data.data;
  },

  async getStats(
    repositoryIds: string[],
    repositoryBranchScopes?: RepositoryBranchScopeMap,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<EventStats> {
    const { data } = await apiClient.get<ApiResponse<EventStats>>('/events/stats', {
      params: {
        repositoryIds: serializeRepositoryIds(repositoryIds),
        branchScopes: serializeBranchScopes(repositoryIds, repositoryBranchScopes),
        dateFrom,
        dateTo,
      },
    });
    return data.data;
  },
};
