import { apiClient } from './api-client';
import type { ApiResponse, PaginatedResponse, EventAnalysis } from '@/types/api';

export const analysisService = {
  async getByEventId(eventId: string): Promise<EventAnalysis> {
    const { data } = await apiClient.get<
      ApiResponse<{ status: string; analysis: EventAnalysis | null }>
    >(`/ai/analysis/${eventId}`);
    return data.data.analysis!;
  },

  async getList(params?: {
    page?: number;
    pageSize?: number;
    riskLevel?: string;
    category?: string;
    status?: string;
  }): Promise<PaginatedResponse<EventAnalysis>> {
    const { data } = await apiClient.get<
      ApiResponse<PaginatedResponse<EventAnalysis>>
    >('/ai/analysis/events', { params });
    return data.data;
  },

  async triggerAnalysis(
    eventId: string,
    force = false,
  ): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<
      ApiResponse<{ success: boolean }>
    >(`/ai/trigger/${eventId}`, { force });
    return data.data;
  },
};
