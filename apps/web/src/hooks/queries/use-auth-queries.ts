import { useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useApiMutation, useApiQuery } from '@/lib/query-hooks';

export const authQueryKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authQueryKeys.all, 'current-user'] as const,
};

export function useCurrentUserQuery(enabled = true) {
  return useApiQuery({
    queryKey: authQueryKeys.currentUser(),
    queryFn: authService.getSession,
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
}

interface UpdatePreferencesPayload {
  preferences: Record<string, unknown>;
}

export function useUpdateUserPreferencesMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'update-preferences'],
    mutationFn: ({ preferences }: UpdatePreferencesPayload) =>
      authService.updatePreferences(preferences),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.currentUser() });
    },
  });
}
