import { apiClient } from './api-client';
import type { WebhookStatus } from '@repo-pulse/shared';
import type {
  ApiResponse,
  Repository,
  RepositoryBranchScopeOption,
  CreateRepositoryDto,
  UpdateRepositoryDto,
  PaginatedResponse,
  Event,
  SearchResult,
} from '@/types/api';

const REPOSITORY_READ_CACHE_TTL_MS = 1500;
const repositoryListReadCache = new Map<string, { expiresAt: number; promise: Promise<Repository[]> }>();

function clearRepositoryReadCache() {
  repositoryListReadCache.clear();
}

export interface WebhookLastResponse {
  code: number | null;
  status: string | null;
  message: string | null;
}

export interface WebhookStatusResponse {
  repositoryId: string;
  url: string;
  secret: string | null;
  webhookId: string | null;
  status: WebhookStatus;
  lastError: string | null;
  active: boolean;
  lastResponse: WebhookLastResponse | null;
}

export interface WebhookProvisionResponse {
  webhookStatus: WebhookStatus;
  webhookError?: string;
  webhookId?: string | null;
}

export interface WebhookTestResponse {
  success: boolean;
}

export function normalizeBranchOption(rawBranch: unknown): RepositoryBranchScopeOption | null {
  if (typeof rawBranch === 'string') {
    const name = rawBranch.trim();
    return name
      ? {
          name,
          isDefault: false,
          isObserved: false,
        }
      : null;
  }

  if (!rawBranch || typeof rawBranch !== 'object') {
    return null;
  }

  const branch = rawBranch as Partial<RepositoryBranchScopeOption> & {
    value?: unknown;
  };
  const rawName = typeof branch.name === 'string'
    ? branch.name
    : typeof branch.value === 'string'
      ? branch.value
      : '';
  const name = rawName.trim();

  if (!name) {
    return null;
  }

  return {
    name,
    isDefault: Boolean(branch.isDefault),
    isObserved: Boolean(branch.isObserved),
    isProtected: branch.isProtected,
    lastCommitSha: branch.lastCommitSha,
  };
}

export const repositoryService = {
  async getAll(isActive?: boolean): Promise<Repository[]> {
    const key = isActive === undefined ? 'all' : String(isActive);
    const now = Date.now();
    const cached = repositoryListReadCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.promise;
    }

    const params = isActive !== undefined ? { isActive } : {};
    const promise = apiClient
      .get<ApiResponse<Repository[]>>('/repositories', { params })
      .then(({ data }) => data.data)
      .catch((error) => {
        if (repositoryListReadCache.get(key)?.promise === promise) {
          repositoryListReadCache.delete(key);
        }
        throw error;
      });

    repositoryListReadCache.set(key, { expiresAt: now + REPOSITORY_READ_CACHE_TTL_MS, promise });
    return promise;
  },

  async getById(id: string): Promise<Repository> {
    const { data } = await apiClient.get<ApiResponse<Repository>>(`/repositories/${id}`);
    return data.data;
  },

  async create(dto: CreateRepositoryDto): Promise<Repository> {
    const { data } = await apiClient.post<ApiResponse<Repository>>('/repositories', dto);
    clearRepositoryReadCache();
    return data.data;
  },

  async update(id: string, dto: UpdateRepositoryDto): Promise<Repository> {
    const { data } = await apiClient.patch<ApiResponse<Repository>>(`/repositories/${id}`, dto);
    clearRepositoryReadCache();
    return data.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/repositories/${id}`);
    clearRepositoryReadCache();
  },

  async sync(id: string): Promise<{ status: 'queued'; jobId: string }> {
    const { data } = await apiClient.post<
      ApiResponse<{ status: 'queued'; jobId: string }>
    >(`/repositories/${id}/sync`);
    return data.data;
  },

  async getBranches(id: string): Promise<RepositoryBranchScopeOption[]> {
    const { data } = await apiClient.get<ApiResponse<unknown[]>>(`/repositories/${id}/branches`);
    return data.data
      .map(normalizeBranchOption)
      .filter((branch): branch is RepositoryBranchScopeOption => Boolean(branch));
  },

  async getEvents(
    repositoryIds: string[],
    options?: {
      page?: number;
      pageSize?: number;
      type?: string;
    },
  ): Promise<PaginatedResponse<Event>> {
    const { data } = await apiClient.get<ApiResponse<PaginatedResponse<Event>>>('/events', {
      params: {
        repositoryIds: [...repositoryIds].sort().join(','),
        ...options,
      },
    });
    return data.data;
  },

  /**
   * 搜索公开仓库
   */
  async search(query: string): Promise<SearchResult[]> {
    const { data } = await apiClient.get<ApiResponse<SearchResult[]>>('/repositories/search', {
      params: { q: query },
    });
    return data.data;
  },

  /**
   * 获取用户作为 contributor 的仓库
   */
  async getMyRepos(): Promise<SearchResult[]> {
    const { data } = await apiClient.get<ApiResponse<SearchResult[]>>('/repositories/my-repos');
    return data.data;
  },

  /**
   * 获取用户 star 的仓库
   */
  async getStarred(): Promise<SearchResult[]> {
    const { data } = await apiClient.get<ApiResponse<SearchResult[]>>('/repositories/starred');
    return data.data;
  },

  /**
   * 获取指定监控仓库的贡献者列表
   */
  async getContributors(id: string): Promise<Array<{ username: string; avatarUrl: string | null }>> {
    const { data } = await apiClient.get<ApiResponse<Array<{ username: string; avatarUrl: string | null }>>>(`/repositories/${id}/contributors`);
    return data.data;
  },

  /**
   * 查询仓库 webhook 状态（实时调 GitHub 验证）
   */
  async getWebhookStatus(id: string): Promise<WebhookStatusResponse> {
    const { data } = await apiClient.get<ApiResponse<WebhookStatusResponse>>(
      `/repositories/${id}/webhook`,
    );
    return data.data;
  },

  /**
   * 重新创建仓库的 webhook
   */
  async retryWebhook(id: string): Promise<WebhookProvisionResponse> {
    const { data } = await apiClient.post<ApiResponse<WebhookProvisionResponse>>(
      `/repositories/${id}/webhook/retry`,
    );
    clearRepositoryReadCache();
    return data.data;
  },

  /**
   * 让 GitHub 重发 ping 事件验证 webhook 链路
   */
  async testWebhook(id: string): Promise<WebhookTestResponse> {
    const { data } = await apiClient.post<ApiResponse<WebhookTestResponse>>(
      `/repositories/${id}/webhook/test`,
    );
    return data.data;
  },
};
