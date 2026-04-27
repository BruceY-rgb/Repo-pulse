import { apiClient } from './api-client';
import type { ApiResponse } from '@/types/api';

export type NotificationChannel = 'EMAIL' | 'DINGTALK' | 'FEISHU' | 'WEBHOOK' | 'IN_APP';

export interface NotificationPreferences {
  channels: NotificationChannel[];
  events: {
    highRisk: boolean;
    prUpdates: boolean;
    analysisComplete: boolean;
    weeklyReport: boolean;
  };
  webhookUrl?: string;
  email?: string;
}

interface Notification {
  id: string;
  userId: string;
  eventId?: string;
  channel: NotificationChannel;
  title: string;
  content: string;
  status: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  total: number;
}

export const notificationService = {
  /**
   * 获取用户通知偏好
   */
  async getPreferences(): Promise<NotificationPreferences> {
    const { data } = await apiClient.get<ApiResponse<NotificationPreferences>>('/notifications/preferences');
    return data.data;
  },

  /**
   * 更新用户通知偏好
   */
  async updatePreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const { data } = await apiClient.post<ApiResponse<NotificationPreferences>>('/notifications/preferences', prefs);
    return data.data;
  },

  /**
   * 获取通知列表
   */
  async getNotifications(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<NotificationsResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));

    const { data } = await apiClient.get<ApiResponse<NotificationsResponse>>(`/notifications?${params}`);
    return data.data;
  },

  /**
   * 获取未读数量
   */
  async getUnreadCount(): Promise<{ count: number }> {
    const { data } = await apiClient.get<ApiResponse<{ count: number }>>('/notifications/unread-count');
    return data.data;
  },

  /**
   * 标记通知为已读
   */
  async markAsRead(notificationId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<ApiResponse<{ success: boolean }>>(`/notifications/${notificationId}/read`);
    return data.data;
  },

  /**
   * 标记所有通知为已读
   */
  async markAllAsRead(): Promise<{ success: boolean }> {
    const { data } = await apiClient.post<ApiResponse<{ success: boolean }>>('/notifications/read-all');
    return data.data;
  },

  /**
   * 删除通知
   */
  async deleteNotification(notificationId: string): Promise<{ success: boolean }> {
    const { data } = await apiClient.delete<ApiResponse<{ success: boolean }>>(`/notifications/${notificationId}`);
    return data.data;
  },
};
