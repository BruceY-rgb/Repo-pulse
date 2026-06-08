import { create } from 'zustand';
import type { User } from '@/types/api';
import { authService } from '@/services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string, verificationCode: string) => Promise<void>;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // 初始状态：不依赖 localStorage，通过 fetchUser 验证 Cookie 是否有效
  isAuthenticated: false,
  isLoading: false,

  login: async (email: string, password: string, verificationCode: string) => {
    set({ isLoading: true });
    try {
      // 登录后 Token 已写入 HttpOnly Cookie，只需获取用户信息
      await authService.login(email, password, verificationCode);
      const user = await authService.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  /**
   * 验证当前 Cookie 是否有效，并获取用户信息
   * 在应用初始化时调用，替代原来检查 localStorage 的方式
   */
  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const user = await authService.getSession();
      set({ user, isAuthenticated: Boolean(user), isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, isAuthenticated: false });
  },
}));
