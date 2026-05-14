import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

interface UpdatePreferencesPayload {
  preferences: Record<string, unknown>;
}

async function resolveCurrentUserAfterDesktopOAuth() {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await authService.getMe();
    } catch (error) {
      lastError = error;

      await new Promise((resolve) => {
        window.setTimeout(resolve, 500);
      });
    }
  }

  throw lastError;
}

export function useGithubOAuthConfigMutation() {
  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'github-oauth-config'],
    mutationFn: async ({ clientId, clientSecret }: GithubOAuthConfigPayload) =>
      authService.configureGithubOAuth(clientId, clientSecret),
  });
}

export function useDevGithubSessionMutation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useApiMutation({
    mutationKey: [...authQueryKeys.all, 'dev-github-session'],
    mutationFn: async () => {
      await authService.createDevGithubSession();
      return authService.getMe();
    },
    onSuccess: async (user) => {
      queryClient.setQueryData(authQueryKeys.currentUser(), user);
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.currentUser() });
      navigate('/chats', { replace: true });
    },
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

export function useGithubOAuthLogin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMemo(
    () => async () => {
      if (window.desktop?.loginWithGithub) {
        const result = await window.desktop.loginWithGithub();

        if (!result.ok) {
          const reason = result.reason
            ? `&reason=${encodeURIComponent(result.reason)}`
            : '';
          navigate(`/login?error=oauth_failed${reason}`, { replace: true });
          return;
        }

        try {
          const user = await resolveCurrentUserAfterDesktopOAuth();
          queryClient.setQueryData(authQueryKeys.currentUser(), user);
          navigate('/chats', { replace: true });
        } catch {
          navigate('/login?error=oauth_failed&reason=session_unavailable', { replace: true });
        }
        return;
      }

      window.location.href = authService.getGithubAuthUrl();
    },
    [navigate, queryClient],
  );
}
