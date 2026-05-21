import { apiClient } from './api-client';
import type {
  ApiResponse,
  Repository,
  RepositoryBranchScopeOption,
  CreateRepositoryDto,
  UpdateRepositoryDto,
  PaginatedResponse,
  Event,
  SearchResult,
} from '@/types/api';

export function normalizeBranchOption(rawBranch: unknown): RepositoryBranchScopeOption | null {
  if (typeof rawBranch === 'string') {
    const name = rawBranch.trim();
    return name
      ? {
          name,
          isDefault: false,
          isObserved: false,
        }
      : null;
  }

  if (!rawBranch || typeof rawBranch !== 'object') {
    return null;
  }

  const branch = rawBranch as Partial<RepositoryBranchScopeOption> & {
    value?: unknown;
  };
  const rawName = typeof branch.name === 'string'
    ? branch.name
    : typeof branch.value === 'string'
      ? branch.value
      : '';
  const name = rawName.trim();

  if (!name) {
    return null;
  }

  return {
    name,
    isDefault: Boolean(branch.isDefault),
    isObserved: Boolean(branch.isObserved),
    isProtected: branch.isProtected,
    lastCommitSha: branch.lastCommitSha,
  };
}

export const repositoryService = {
  async getAll(isActive?: boolean): Promise<Repository[]> {
    const params = isActive !== undefined ? { isActive } : {};
    const { data } = await apiClient.get<ApiResponse<Repository[]>>('/repositories', { params });
    return data.data;
  },

  async getById(id: string): Promise<Repository> {
    const { data } = await apiClient.get<ApiResponse<Repository>>(`/repositories/${id}`);
    return data.data;
  },

  async create(dto: CreateRepositoryDto): Promise<Repository> {
    const { data } = await apiClient.post<ApiResponse<Repository>>('/repositories', dto);
    return data.data;
  },

  async update(id: string, dto: UpdateRepositoryDto): Promise<Repository> {
    const { data } = await apiClient.patch<ApiResponse<Repository>>(`/repositories/${id}`, dto);
    return data.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/repositories/${id}`);
  },

  async sync(id: string): Promise<{ status: 'queued'; jobId: string }> {
    const { data } = await apiClient.post<
      ApiResponse<{ status: 'queued'; jobId: string }>
    >(`/repositories/${id}/sync`);
    return data.data;
  },

  async getBranches(id: string): Promise<RepositoryBranchScopeOption[]> {
    const { data } = await apiClient.get<ApiResponse<unknown[]>>(`/repositories/${id}/branches`);
    return data.data
      .map(normalizeBranchOption)
      .filter((branch): branch is RepositoryBranchScopeOption => Boolean(branch));
  },

  async getEvents(
    repositoryIds: string[],
    options?: {
      page?: number;
      pageSize?: number;
      type?: string;
    },
  ): Promise<PaginatedResponse<Event>> {
    const { data } = await apiClient.get<ApiResponse<PaginatedResponse<Event>>>('/events', {
      params: {
        repositoryIds: [...repositoryIds].sort().join(','),
        ...options,
      },
    });
    return data.data;
  },

  /**
   * 搜索公开仓库
   */
  async search(query: string): Promise<SearchResult[]> {
    const { data } = await apiClient.get<ApiResponse<SearchResult[]>>('/repositories/search', {
      params: { q: query },
    });
    return data.data;
  },

  /**
   * 获取用户作为 contributor 的仓库
   */
  async getMyRepos(): Promise<SearchResult[]> {
    const { data } = await apiClient.get<ApiResponse<SearchResult[]>>('/repositories/my-repos');
    return data.data;
  },

  /**
   * 获取用户 star 的仓库
   */
  async getStarred(): Promise<SearchResult[]> {
    const { data } = await apiClient.get<ApiResponse<SearchResult[]>>('/repositories/starred');
    return data.data;
  },
};
