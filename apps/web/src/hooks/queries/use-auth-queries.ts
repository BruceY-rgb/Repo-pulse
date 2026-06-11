import { useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useApiMutation, useApiQuery } from '@/lib/query-hooks';

export const authQueryKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authQueryKeys.all, 'current-user'] as const,
  bootstrapStatus: () => [...authQueryKeys.all, 'bootstrap-status'] as const,
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

export function useBootstrapStatusQuery() {
  return useApiQuery({
    queryKey: authQueryKeys.bootstrapStatus(),
    queryFn: authService.getBootstrapStatus,
    retry: false,
    staleTime: 30 * 1000,
  });
}

interface LoginPayload {
  email: string;
  password: string;
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'login'],
    mutationFn: async ({ email, password }: LoginPayload) => {
      await authService.login(email, password);
      return authService.getSession();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.currentUser() });
    },
  });
}

interface RegisterPayload {
  email: string;
  name: string;
  password: string;
  username?: string;
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'register'],
    mutationFn: async (payload: RegisterPayload) => {
      await authService.register(payload);
      return authService.getSession();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
    },
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

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'logout'],
    mutationFn: async () => {
      await authService.logout();
      return true;
    },
    onSuccess: async () => {
      await queryClient.removeQueries({ queryKey: authQueryKeys.currentUser() });
    },
  });
}
