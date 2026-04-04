import { apiClient } from './api-client';
import type {
  ApiResponse,
  Repository,
  CreateRepositoryDto,
  UpdateRepositoryDto,
  PaginatedResponse,
  Event,
  SearchResult,
} from '@/types/api';

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

  async sync(id: string): Promise<Repository> {
    const { data } = await apiClient.post<ApiResponse<Repository>>(`/repositories/${id}/sync`);
    return data.data;
  },

  async getEvents(
    repositoryId: string,
    options?: {
      page?: number;
      pageSize?: number;
      type?: string;
    },
  ): Promise<PaginatedResponse<Event>> {
    const { data } = await apiClient.get<ApiResponse<PaginatedResponse<Event>>>('/events', {
      params: {
        repositoryId,
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
