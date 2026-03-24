import { apiClient } from './api-client';
import type { ApiResponse, PaginatedResponse, Event } from '@/types/api';

export interface EventStats {
  total: number;
  byType: Array<{
    type: string;
    count: number;
  }>;
}

export const eventService = {
  async getAll(
    repositoryId: string,
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
        repositoryId,
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
    repositoryId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<EventStats> {
    const { data } = await apiClient.get<ApiResponse<EventStats>>('/events/stats', {
      params: {
        repositoryId,
        dateFrom,
        dateTo,
      },
    });
    return data.data;
  },
};
