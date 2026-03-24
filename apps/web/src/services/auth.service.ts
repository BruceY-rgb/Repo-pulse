import { apiClient } from './api-client';
import type { ApiResponse, TokenPair, User } from '@/types/api';

export const authService = {
  async login(email: string, password: string): Promise<TokenPair> {
    const { data } = await apiClient.post<ApiResponse<TokenPair>>(
      '/auth/login',
      { email, password },
    );
    return data.data;
  },

  async getMe(): Promise<User> {
    const { data } = await apiClient.get<ApiResponse<User>>('/auth/me');
    return data.data;
  },

  async refresh(refreshToken: string): Promise<TokenPair> {
    const { data } = await apiClient.post<ApiResponse<TokenPair>>(
      '/auth/refresh',
      { refreshToken },
    );
    return data.data;
  },

  getGithubAuthUrl(): string {
    return '/api/auth/github';
  },

  logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
};
