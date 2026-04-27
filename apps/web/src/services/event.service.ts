import { apiClient } from './api-client';
import type { ApiResponse, PaginatedResponse, Event } from '@/types/api';

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

export const eventService = {
  async getAll(
    repositoryIds: string[],
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
    dateFrom?: string,
    dateTo?: string,
  ): Promise<EventStats> {
    const { data } = await apiClient.get<ApiResponse<EventStats>>('/events/stats', {
      params: {
        repositoryIds: serializeRepositoryIds(repositoryIds),
        dateFrom,
        dateTo,
      },
    });
    return data.data;
  },
};
