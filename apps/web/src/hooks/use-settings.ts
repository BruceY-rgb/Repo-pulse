import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService, type AIConfig } from '@/services/settings.service';

// Query Keys
export const settingsKeys = {
  all: ['settings'] as const,
  ai: () => [...settingsKeys.all, 'ai'] as const,
};

// Queries
export function useAIConfig() {
  return useQuery({
    queryKey: settingsKeys.ai(),
    queryFn: () => settingsService.getAIConfig(),
  });
}

// Mutations
export function useUpdateAIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<AIConfig>) => settingsService.updateAIConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.ai() });
    },
  });
}