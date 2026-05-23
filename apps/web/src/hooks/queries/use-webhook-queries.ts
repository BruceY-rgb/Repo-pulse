import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation, useApiQuery } from '@/lib/query-hooks';
import { repositoryService } from '@/services/repository.service';
import { repositoryQueryKeys } from './use-repository-queries';

export const webhookQueryKeys = {
  all: ['webhooks'] as const,
  byRepo: (repositoryId: string) => [...webhookQueryKeys.all, 'byRepo', repositoryId] as const,
};

export function useWebhookStatusQuery(repositoryId: string, enabled = true) {
  return useApiQuery({
    queryKey: webhookQueryKeys.byRepo(repositoryId),
    queryFn: () => repositoryService.getWebhookStatus(repositoryId),
    enabled: enabled && Boolean(repositoryId),
    staleTime: 30 * 1000,
  });
}

export function useRetryWebhookMutation() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationKey: [...webhookQueryKeys.all, 'retry'],
    mutationFn: (repositoryId: string) => repositoryService.retryWebhook(repositoryId),
    onSuccess: (_data, repositoryId) => {
      void queryClient.invalidateQueries({ queryKey: webhookQueryKeys.byRepo(repositoryId) });
      void queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() });
      void queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.detail(repositoryId) });
    },
  });
}

export function useTestWebhookMutation() {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationKey: [...webhookQueryKeys.all, 'test'],
    mutationFn: (repositoryId: string) => repositoryService.testWebhook(repositoryId),
    onSuccess: (_data, repositoryId) => {
      void queryClient.invalidateQueries({ queryKey: webhookQueryKeys.byRepo(repositoryId) });
    },
  });
}
