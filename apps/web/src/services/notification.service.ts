import { apiClient } from './api-client';

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
    const response = await apiClient.get<NotificationPreferences>('/notifications/preferences');
    return response.data;
  },

  /**
   * 更新用户通知偏好
   */
  async updatePreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const response = await apiClient.post<NotificationPreferences>('/notifications/preferences', prefs);
    return response.data;
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

    const response = await apiClient.get<NotificationsResponse>(`/notifications?${params}`);
    return response.data;
  },

  /**
   * 获取未读数量
   */
  async getUnreadCount(): Promise<{ count: number }> {
    const response = await apiClient.get<{ count: number }>('/notifications/unread-count');
    return response.data;
  },

  /**
   * 标记通知为已读
   */
  async markAsRead(notificationId: string): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>(`/notifications/${notificationId}/read`);
    return response.data;
  },

  /**
   * 标记所有通知为已读
   */
  async markAllAsRead(): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>('/notifications/read-all');
    return response.data;
  },

  /**
   * 删除通知
   */
  async deleteNotification(notificationId: string): Promise<{ success: boolean }> {
    const response = await apiClient.delete<{ success: boolean }>(`/notifications/${notificationId}`);
    return response.data;
  },
};