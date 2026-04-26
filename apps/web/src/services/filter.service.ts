import type {
  ApiResponse,
  CreateFilterRulePayload,
  FilterRuleDto,
  TestFilterPayload,
  TestFilterResult,
  UpdateFilterRulePayload,
} from '@repo-pulse/shared';

import { apiClient } from '@/services/api-client';

export const filterService = {
  async getRules(): Promise<FilterRuleDto[]> {
    const { data } = await apiClient.get<ApiResponse<FilterRuleDto[]>>('/filters');
    return data.data;
  },

  async createRule(payload: CreateFilterRulePayload): Promise<FilterRuleDto> {
    const { data } = await apiClient.post<ApiResponse<FilterRuleDto>>('/filters', payload);
    return data.data;
  },

  async updateRule(
    ruleId: string,
    payload: UpdateFilterRulePayload,
  ): Promise<FilterRuleDto> {
    const { data } = await apiClient.put<ApiResponse<FilterRuleDto>>(`/filters/${ruleId}`, payload);
    return data.data;
  },

  async deleteRule(ruleId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<ApiResponse<{ success: boolean }>>(`/filters/${ruleId}`);
    return data.data;
  },

  async testRule(payload: TestFilterPayload): Promise<TestFilterResult> {
    const { data } = await apiClient.post<ApiResponse<TestFilterResult>>('/filters/test', payload);
    return data.data;
  },
};
