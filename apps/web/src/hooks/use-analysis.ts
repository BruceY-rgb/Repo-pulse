import { useQueryClient } from '@tanstack/react-query';
import { analysisService } from '@/services/analysis.service';
import type { EventAnalysis, PaginatedResponse } from '@/types/api';
import { useApiQuery, useApiMutation } from '@/lib/query-hooks';

export const analysisQueryKeys = {
  all: ['analyses'] as const,
  list: (params?: Record<string, unknown>) =>
    [...analysisQueryKeys.all, 'list', params ?? {}] as const,
  detail: (eventId: string) =>
    [...analysisQueryKeys.all, 'detail', eventId] as const,
};

export function useAnalysisList(params?: {
  page?: number;
  pageSize?: number;
  riskLevel?: string;
  category?: string;
  status?: string;
}) {
  return useApiQuery<PaginatedResponse<EventAnalysis>, ReturnType<typeof analysisQueryKeys.list>>({
    queryKey: analysisQueryKeys.list(params as Record<string, unknown>),
    queryFn: () => analysisService.getList(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useEventAnalysis(eventId: string | undefined) {
  return useApiQuery<EventAnalysis | null, ReturnType<typeof analysisQueryKeys.detail>>({
    queryKey: analysisQueryKeys.detail(eventId ?? ''),
    queryFn: () => analysisService.getByEventId(eventId!),
    enabled: !!eventId,
  });
}

export function useTriggerAnalysis() {
  const queryClient = useQueryClient();

  return useApiMutation<
    { success: boolean },
    { eventId: string; force?: boolean }
  >({
    mutationFn: ({ eventId, force }) =>
      analysisService.triggerAnalysis(eventId, force),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: analysisQueryKeys.detail(variables.eventId),
      });
      queryClient.invalidateQueries({
        queryKey: analysisQueryKeys.all,
      });
    },
  });
}
