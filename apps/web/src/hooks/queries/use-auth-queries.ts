import { useQueryClient } from '@tanstack/react-query';
import type { LoginPayload, RegisterPayload } from '@repo-pulse/shared';
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

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'login'],
    mutationFn: async ({ email, password }: LoginPayload) => {
      await authService.login(email, password);
      return authService.getSession();
    },
    // 直接用刚拿到的会话替换 currentUser 缓存（而非仅 invalidate）。
    // invalidate 会先把旧的过期值（桌面端启动时缓存的 null）返回给路由守卫，
    // 导致登录后被瞬时弹回登录页、需登录两次。setQueryData 让守卫同步读到真实用户。
    onSuccess: (user) => {
      queryClient.setQueryData(authQueryKeys.currentUser(), user);
    },
  });
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'register'],
    mutationFn: async (payload: RegisterPayload) => {
      await authService.register(payload);
      return authService.getSession();
    },
    // 同登录：以真实会话替换 currentUser 缓存，注册成功后直达工作台、不再回登录页。
    // bootstrap-status 仅影响登录页文案，单独 invalidate 即可（不再失效 currentUser）。
    onSuccess: async (user) => {
      queryClient.setQueryData(authQueryKeys.currentUser(), user);
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.bootstrapStatus() });
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
