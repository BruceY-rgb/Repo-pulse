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
  async login(email: string, password: string): Promise<{ userId: string; email: string; name: string }> {
    const { data } = await apiClient.post<ApiResponse<{ userId: string; email: string; name: string }>>(
      '/auth/login',
      { email, password },
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

  /**
   * 获取 GitHub OAuth 登录 URL
   */
  getGithubAuthUrl(): string {
    return '/api/auth/github';
  },

  /**
   * 运行时配置 GitHub OAuth 客户端参数
   */
  async configureGithubOAuth(clientId: string, clientSecret: string): Promise<{ message: string }> {
    const { data } = await apiClient.post<{ message: string }>('/auth/github/config', {
      clientId,
      clientSecret,
    });
    return data;
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
