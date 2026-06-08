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
  verificationCode: string;
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'login'],
    mutationFn: async ({ email, password, verificationCode }: LoginPayload) => {
      await authService.login(email, password, verificationCode);
      return authService.getSession();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.currentUser() });
    },
  });
}

export function useBootstrapMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'bootstrap'],
    mutationFn: async (payload: {
      email: string;
      name: string;
      password: string;
      verificationCode: string;
      username?: string;
    }) => {
      await authService.bootstrap(payload);
      return authService.getSession();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.currentUser() });
    },
  });
}

interface UpdatePreferencesPayload {
  preferences: Record<string, unknown>;
}

export function useSendVerificationCodeMutation() {
  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'send-verification-code'],
    mutationFn: ({ email, purpose }: { email: string; purpose: 'LOGIN' | 'BOOTSTRAP' }) =>
      authService.sendVerificationCode(email, purpose),
  });
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
