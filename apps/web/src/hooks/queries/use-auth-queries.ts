import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useApiMutation, useApiQuery } from '@/lib/query-hooks';

export const authQueryKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authQueryKeys.all, 'current-user'] as const,
  githubOAuthRuntimeConfig: () => [...authQueryKeys.all, 'github-oauth-runtime-config'] as const,
};

export function useCurrentUserQuery(enabled = true) {
  return useApiQuery({
    queryKey: authQueryKeys.currentUser(),
    queryFn: authService.getMe,
    enabled,
    retry: false,
    staleTime: 60 * 1000,
  });
}

export function useGithubOAuthRuntimeConfigQuery() {
  return useApiQuery({
    queryKey: authQueryKeys.githubOAuthRuntimeConfig(),
    queryFn: authService.getGithubOAuthRuntimeConfig,
    retry: false,
    staleTime: 5 * 60 * 1000,
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
      return authService.getMe();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.currentUser() });
    },
  });
}

interface GithubOAuthConfigPayload {
  clientId: string;
  clientSecret: string;
}

export function useGithubOAuthConfigMutation() {
  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'github-oauth-config'],
    mutationFn: async ({ clientId, clientSecret }: GithubOAuthConfigPayload) =>
      authService.configureGithubOAuth(clientId, clientSecret),
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

export function useGithubOAuthLogin() {
  return useMemo(
    () => () => {
      window.location.href = authService.getGithubAuthUrl();
    },
    [],
  );
}
