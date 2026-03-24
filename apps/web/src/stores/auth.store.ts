import { create } from 'zustand';
import type { User } from '@/types/api';
import { authService } from '@/services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (email: string, password: string) => Promise<void>;
  loginWithGithub: () => void;
  handleOAuthCallback: (accessToken: string, refreshToken: string) => Promise<void>;
  fetchUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const tokens = await authService.login(email, password);
      localStorage.setItem('accessToken', tokens.accessToken);
      localStorage.setItem('refreshToken', tokens.refreshToken);

      const user = await authService.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  loginWithGithub: () => {
    window.location.href = authService.getGithubAuthUrl();
  },

  handleOAuthCallback: async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    const user = await authService.getMe();
    set({ user, isAuthenticated: true });
  },

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const user = await authService.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
      authService.logout();
    }
  },

  logout: () => {
    authService.logout();
    set({ user: null, isAuthenticated: false });
  },
}));
