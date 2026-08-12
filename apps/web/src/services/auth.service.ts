import { apiClient } from './api-client';
import type { ApiResponse, User } from '@/types/api';

export interface DesktopSessionResult {
  status: 'authenticated' | 'locked';
  lockEnabled: boolean;
  userId?: string;
}

export interface AppLockStatus {
  enabled: boolean;
  hasPassword: boolean;
}

/**
 * 前端认证服务
 * Token 由后端写入 HttpOnly Cookie，前端无需手动管理 Token
 */
export const authService = {
  /**
   * 获取当前登录用户信息（依赖 Cookie 中的 access_token）
   */
  async getMe(): Promise<User> {
    const { data } = await apiClient.get<ApiResponse<User>>('/auth/me');
    return data.data;
  },

  async getSession(): Promise<User | null> {
    const { data } = await apiClient.get<ApiResponse<User | null>>('/auth/session');
    return data.data ?? null;
  },

  async startDesktopSession(password?: string): Promise<DesktopSessionResult> {
    const { data } = await apiClient.post<ApiResponse<DesktopSessionResult>>(
      '/auth/desktop-session',
      password ? { password } : {},
      { headers: { 'X-Repo-Pulse-Desktop': 'electron' } },
    );
    return data.data;
  },

  async getAppLockStatus(): Promise<AppLockStatus> {
    const { data } = await apiClient.get<ApiResponse<AppLockStatus>>('/auth/app-lock');
    return data.data;
  },

  async enableAppLock(password: string): Promise<AppLockStatus> {
    const { data } = await apiClient.post<ApiResponse<AppLockStatus>>('/auth/app-lock/enable', { password });
    return data.data;
  },

  async changeAppLockPassword(currentPassword: string, newPassword: string): Promise<AppLockStatus> {
    const { data } = await apiClient.post<ApiResponse<AppLockStatus>>('/auth/app-lock/change-password', {
      currentPassword,
      newPassword,
    });
    return data.data;
  },

  async disableAppLock(password: string): Promise<AppLockStatus> {
    const { data } = await apiClient.post<ApiResponse<AppLockStatus>>('/auth/app-lock/disable', { password });
    return data.data;
  },

  async updatePreferences(preferences: Record<string, unknown>): Promise<User> {
    const { data } = await apiClient.patch<ApiResponse<User>>('/users/preferences', {
      preferences,
    });
    return data.data;
  },

};
