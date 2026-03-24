import { apiClient } from './api-client';
import type { ApiResponse, Repository, CreateRepositoryDto, PaginatedResponse, Event } from '@/types/api';

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

  async update(id: string, dto: Partial<CreateRepositoryDto>): Promise<Repository> {
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
};
