import { useQueryClient } from '@tanstack/react-query';
import type { CreateFilterRulePayload, UpdateFilterRulePayload } from '@repo-pulse/shared';

import { useApiMutation, useApiQuery } from '@/lib/query-hooks';
import { filterService } from '@/services/filter.service';

export const filterQueryKeys = {
  all: ['filters'] as const,
  list: () => [...filterQueryKeys.all, 'list'] as const,
};

export function useFilterRulesQuery() {
  return useApiQuery({
    queryKey: filterQueryKeys.list(),
    queryFn: filterService.getRules,
    staleTime: 30 * 1000,
  });
}

export function useCreateFilterRuleMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...filterQueryKeys.all, 'create'],
    mutationFn: (payload: CreateFilterRulePayload) => filterService.createRule(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: filterQueryKeys.all });
    },
  });
}

export function useUpdateFilterRuleMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...filterQueryKeys.all, 'update'],
    mutationFn: (variables: { payload: UpdateFilterRulePayload; ruleId: string }) =>
      filterService.updateRule(variables.ruleId, variables.payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: filterQueryKeys.all });
    },
  });
}

export function useDeleteFilterRuleMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...filterQueryKeys.all, 'delete'],
    mutationFn: (ruleId: string) => filterService.deleteRule(ruleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: filterQueryKeys.all });
    },
  });
}
