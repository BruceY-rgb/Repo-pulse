import axios from 'axios';
import type { AxiosError } from 'axios';
import type { ApiResponse } from '@/types/api';
import { getApiBaseUrl, toApiUrl } from '@/lib/desktop';

/**
 * 全局 Axios 客户端
 * - Token 存储在 HttpOnly Cookie 中，由浏览器自动携带
 * - withCredentials: true 确保跨域请求携带 Cookie
 * - 401 时自动调用 /auth/refresh 刷新 Token
 */
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  withCredentials: true, // 携带 HttpOnly Cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// 防止并发刷新：记录是否正在刷新中
let isRefreshing = false;
let refreshSubscribers: Array<(success: boolean) => void> = [];

function subscribeTokenRefresh(cb: (success: boolean) => void) {
  refreshSubscribers.push(cb);
}

function notifySubscribers(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success));
  refreshSubscribers = [];
}

// 桌面会话接口的 401 表示应用锁密码错误，而不是会话过期。
const CREDENTIAL_ENDPOINTS = ['/auth/desktop-session'];

// Response interceptor: 处理 401 自动刷新
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<null>>) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };
    const requestUrl = originalRequest?.url ?? '';

    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      !requestUrl.includes('/auth/refresh') &&
      !CREDENTIAL_ENDPOINTS.some((endpoint) => requestUrl.includes(endpoint))
    ) {
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
        await axios.post(toApiUrl('/auth/refresh'), {}, { withCredentials: true });
        isRefreshing = false;
        notifySubscribers(true);

        // 重放原始请求
        if (originalRequest) {
          return apiClient(originalRequest);
        }
      } catch {
        isRefreshing = false;
        notifySubscribers(false);
        // Electron-only 渲染层由 ProtectedRoute 重新建立本地会话或展示应用锁。
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export { apiClient };
