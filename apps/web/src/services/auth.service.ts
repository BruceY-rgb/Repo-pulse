import type {
  BootstrapStatus,
  LoginResult,
  RegisterPayload,
  RegisterResult,
} from '@repo-pulse/shared';
import { apiClient } from './api-client';
import type { ApiResponse, User } from '@/types/api';

/**
 * 前端认证服务
 * Token 由后端写入 HttpOnly Cookie，前端无需手动管理 Token
 */
export const authService = {
  /**
   * 邮箱密码登录
   * 后端在响应中通过 Set-Cookie 设置 access_token 和 refresh_token
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const { data } = await apiClient.post<ApiResponse<LoginResult>>(
      '/auth/login',
      { email, password },
    );
    return data.data;
  },

  /** 是否还没有任何账号（首次使用，注册的首个用户将成为管理员） */
  async getBootstrapStatus(): Promise<BootstrapStatus> {
    const { data } = await apiClient.get<ApiResponse<BootstrapStatus>>('/auth/bootstrap-status');
    return data.data;
  },

  /**
   * 账号密码注册 — 注册成功后后端直接写入登录 Cookie
   */
  async register(payload: RegisterPayload): Promise<RegisterResult> {
    const { data } = await apiClient.post<ApiResponse<RegisterResult>>(
      '/auth/register',
      payload,
    );
    return data.data;
  },

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

  async updatePreferences(preferences: Record<string, unknown>): Promise<User> {
    const { data } = await apiClient.patch<ApiResponse<User>>('/users/preferences', {
      preferences,
    });
    return data.data;
  },

  /**
   * 登出 — 调用后端接口清除 Cookie
   */
  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // 忽略登出接口错误，确保前端状态一定被清除
    }
  },
};
