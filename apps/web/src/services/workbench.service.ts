import { apiClient } from './api-client';
import type {
  ApiResponse,
  ChatRepositoriesResponse,
  ConversationMessagesResponse,
  CreateRepositoryDto,
  MarkConversationReadDto,
  WatchFeedResponse,
  WatchRepositoryItem,
} from '@/types/api';

export interface WatchFeedParams {
  type?: string;
  cursor?: string;
  limit?: number;
}

export interface ConversationMessagesParams {
  cursor?: string;
  skip?: number;
  take?: number;
}

export const workbenchService = {
  /** 获取 Chat 仓库列表（已分组：可操作 / 只读监控） */
  async getChatRepositories(): Promise<ChatRepositoriesResponse> {
    const { data } = await apiClient.get<ApiResponse<ChatRepositoriesResponse>>(
      '/workbench/chat/repositories',
    );
    return data.data;
  },

  /** 获取指定仓库的会话消息（含会话状态和消息列表） */
  async getConversationMessages(
    repositoryId: string,
    params?: ConversationMessagesParams,
  ): Promise<ConversationMessagesResponse> {
    const { data } = await apiClient.get<
      ApiResponse<ConversationMessagesResponse>
    >(`/workbench/chat/repositories/${repositoryId}/messages`, { params });
    return data.data;
  },

  /** 标记仓库会话为已读 */
  async markConversationRead(
    repositoryId: string,
    body?: MarkConversationReadDto,
  ): Promise<void> {
    await apiClient.post(
      `/workbench/chat/repositories/${repositoryId}/read`,
      body ?? {},
    );
  },

  /** 获取 Watch Feed（关注动态） */
  async getWatchFeed(params?: WatchFeedParams): Promise<WatchFeedResponse> {
    const { data } = await apiClient.get<ApiResponse<WatchFeedResponse>>(
      '/workbench/watch-feed',
      { params },
    );
    return data.data;
  },

  /** 获取 Watch Feed 的关注仓库源 */
  async getWatchRepositories(): Promise<WatchRepositoryItem[]> {
    const { data } = await apiClient.get<ApiResponse<WatchRepositoryItem[]>>(
      '/workbench/watch-repositories',
    );
    return data.data;
  },

  /** 添加仓库到 Watch Feed 关注源 */
  async addWatchRepository(dto: CreateRepositoryDto): Promise<WatchRepositoryItem> {
    const { data } = await apiClient.post<ApiResponse<WatchRepositoryItem>>(
      '/workbench/watch-repositories',
      dto,
    );
    return data.data;
  },
};
