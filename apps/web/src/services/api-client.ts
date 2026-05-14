import axios from 'axios';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/types/api';

/**
 * 全局 Axios 客户端
 * - Token 存储在 HttpOnly Cookie 中，由浏览器自动携带
 * - withCredentials: true 确保跨域请求携带 Cookie
 * - 401 时自动调用 /auth/refresh 刷新 Token
 */
const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true, // 携带 HttpOnly Cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// 防止并发刷新：记录是否正在刷新中
let isRefreshing = false;
let refreshSubscribers: Array<(success: boolean) => void> = [];
let desktopApiBaseUrlPromise: Promise<string> | null = null;

function isDesktopRuntime() {
  return typeof window !== 'undefined' && Boolean(window.desktop);
}

async function resolveApiBaseUrl() {
  if (!isDesktopRuntime()) {
    return '/api';
  }

  desktopApiBaseUrlPromise ??= window.desktop
    ?.getApiBaseUrl()
    .catch(() => 'http://localhost:3001') ?? Promise.resolve('http://localhost:3001');

  return desktopApiBaseUrlPromise;
}

function subscribeTokenRefresh(cb: (success: boolean) => void) {
  refreshSubscribers.push(cb);
}

function notifySubscribers(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success));
  refreshSubscribers = [];
}

apiClient.interceptors.request.use(async (config) => {
  config.baseURL = await resolveApiBaseUrl();
  return config;
});

// Response interceptor: 处理 401 自动刷新
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        // 如果正在刷新，等待刷新完成后重试
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((success) => {
            if (success && originalRequest) {
              resolve(apiClient(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      if (originalRequest) {
        originalRequest._retry = true;
      }
      isRefreshing = true;

      try {
        // 调用刷新接口（Cookie 自动携带 refresh_token）
        const apiBaseUrl = await resolveApiBaseUrl();
        await axios.post(`${apiBaseUrl}/auth/refresh`, {}, { withCredentials: true });
        isRefreshing = false;
        notifySubscribers(true);

        // 重放原始请求
        if (originalRequest) {
          return apiClient(originalRequest);
        }
      } catch {
        isRefreshing = false;
        notifySubscribers(false);
        // 刷新失败，重定向到登录页
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);

export { apiClient };
