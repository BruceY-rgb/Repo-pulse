import { apiClient } from './api-client';
import type {
  ApiResponse,
  ChatRepositoriesResponse,
  WorkbenchConversationMessage,
  WatchFeedResponse,
} from '@/types/api';

export interface WatchFeedParams {
  type?: string;
  cursor?: string;
  limit?: number;
}

export const workbenchService = {
  /** 获取 Chat 仓库列表（已分组：可操作 / 只读监控） */
  async getChatRepositories(): Promise<ChatRepositoriesResponse> {
    const { data } = await apiClient.get<ApiResponse<ChatRepositoriesResponse>>(
      '/workbench/chat/repositories',
    );
    return data.data;
  },

  /** 获取指定仓库的会话消息 */
  async getConversationMessages(
    repositoryId: string,
  ): Promise<WorkbenchConversationMessage[]> {
    const { data } = await apiClient.get<
      ApiResponse<WorkbenchConversationMessage[]>
    >(`/workbench/chat/repositories/${repositoryId}/messages`);
    return data.data;
  },

  /** 获取 Watch Feed（关注动态） */
  async getWatchFeed(params?: WatchFeedParams): Promise<WatchFeedResponse> {
    const { data } = await apiClient.get<ApiResponse<WatchFeedResponse>>(
      '/workbench/watch-feed',
      { params },
    );
    return data.data;
  },
};
