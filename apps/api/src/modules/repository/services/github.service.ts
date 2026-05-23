import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface GithubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GithubSearchResult {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GithubCommitResponse {
  sha: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string;
      date?: string;
    };
  };
  author?: {
    login?: string;
    avatar_url?: string;
  } | null;
}

export interface GithubPullRequestResponse {
  id: number;
  number: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  state?: string;
  merged_at?: string | null;
  closed_at?: string | null;
  updated_at?: string;
  created_at?: string;
  user?: {
    login?: string;
    avatar_url?: string;
  };
}

export interface GithubIssueResponse {
  id: number;
  number: number;
  title?: string;
  body?: string | null;
  html_url?: string;
  state?: string;
  closed_at?: string | null;
  updated_at?: string;
  created_at?: string;
  user?: {
    login?: string;
    avatar_url?: string;
  };
  pull_request?: unknown;
}

export interface GithubBranchInfo {
  name: string;
  isProtected?: boolean;
  lastCommitSha?: string;
}

interface GithubBranchResponse {
  name: string;
  protected?: boolean;
  commit?: {
    sha?: string;
  };
}

interface GithubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GithubSearchResult[];
}

interface GithubWebhookCreatePayload {
  name: 'web';
  config: {
    url: string;
    secret: string;
    content_type: 'json';
    insecure_ssl: '0';
  };
  events: string[];
  active: boolean;
}

interface GithubWebhookResponse {
  id: number;
}

export interface GithubWebhookDetail {
  id: number;
  active: boolean;
  events: string[];
  config: {
    url: string;
    content_type?: string;
  };
  updated_at?: string;
  last_response?: {
    code: number | null;
    status: string | null;
    message: string | null;
  };
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly apiUrl = 'https://api.github.com';
  // 全局只读客户端（无 Token 或使用服务端 Token），用于公开 API 查询
  private readonly defaultClient: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const globalToken = this.configService.get<string>('GITHUB_TOKEN');
    this.defaultClient = axios.create({
      baseURL: this.apiUrl,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(globalToken && { Authorization: `Bearer ${globalToken}` }),
      },
    });
  }

  /**
   * 创建一个以用户 OAuth Token 为凭证的 Axios 客户端
   * 如果未提供 userToken，则使用默认客户端
   */
  private createUserClient(userToken?: string): AxiosInstance {
    if (!userToken) {
      return this.defaultClient;
    }
    return axios.create({
      baseURL: this.apiUrl,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${userToken}`,
      },
    });
  }

  /**
   * 获取仓库基本信息
   * @param userToken 可选的用户 OAuth Token，用于访问私有仓库
   */
  async getRepository(owner: string, repo: string, userToken?: string): Promise<GithubRepoResponse> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get<GithubRepoResponse>(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch repository ${owner}/${repo}`, error);
      throw new Error(`无法获取仓库 ${owner}/${repo}，请检查仓库名称和权限`);
    }
  }

  /**
   * 为仓库注册 Webhook
   * @param userToken 用户的 OAuth Token（必须有 admin:repo_hook 权限）
   * @returns Webhook ID（用于后续删除）
   * @throws AxiosError 让调用方根据 response.status 识别 403/404 等
   */
  async createWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string,
    userToken?: string,
  ): Promise<number> {
    const client = this.createUserClient(userToken);
    const payload: GithubWebhookCreatePayload = {
      name: 'web',
      config: {
        url: webhookUrl,
        secret,
        content_type: 'json',
        insecure_ssl: '0',
      },
      events: [
        'push',
        'pull_request',
        'pull_request_review',
        'issues',
        'issue_comment',
        'release',
        'create',
        'delete',
      ],
      active: true,
    };

    const response = await client.post<GithubWebhookResponse>(
      `/repos/${owner}/${repo}/hooks`,
      payload,
    );
    this.logger.log(`Webhook created for ${owner}/${repo}, id: ${response.data.id}`);
    return response.data.id;
  }

  async deleteWebhook(owner: string, repo: string, webhookId: string, userToken?: string): Promise<void> {
    try {
      const client = this.createUserClient(userToken);
      await client.delete(`/repos/${owner}/${repo}/hooks/${webhookId}`);
      this.logger.log(`Webhook ${webhookId} deleted for ${owner}/${repo}`);
    } catch (error) {
      this.logger.error(`Failed to delete webhook for ${owner}/${repo}`, error);
    }
  }

  /**
   * 查询 webhook 详情（用于验证 webhook 在 GitHub 上是否仍然存在/活跃）
   * @throws AxiosError 让调用方根据 response.status 识别 404
   */
  async getWebhook(
    owner: string,
    repo: string,
    webhookId: string,
    userToken?: string,
  ): Promise<GithubWebhookDetail> {
    const client = this.createUserClient(userToken);
    const response = await client.get<GithubWebhookDetail>(
      `/repos/${owner}/${repo}/hooks/${webhookId}`,
    );
    return response.data;
  }

  /**
   * 列出仓库所有 webhook（用于自愈：当 create 报 "Hook already exists" 时找到旧的）
   */
  async listWebhooks(
    owner: string,
    repo: string,
    userToken?: string,
  ): Promise<GithubWebhookDetail[]> {
    const client = this.createUserClient(userToken);
    const response = await client.get<GithubWebhookDetail[]>(
      `/repos/${owner}/${repo}/hooks`,
      { params: { per_page: 100 } },
    );
    return response.data;
  }

  /**
   * 让 GitHub 重发一个 ping 事件，用于端到端验证 webhook 链路
   * @throws AxiosError 由调用方处理
   */
  async pingWebhook(
    owner: string,
    repo: string,
    webhookId: string,
    userToken?: string,
  ): Promise<void> {
    const client = this.createUserClient(userToken);
    await client.post(`/repos/${owner}/${repo}/hooks/${webhookId}/pings`);
    this.logger.log(`Webhook ${webhookId} ping requested for ${owner}/${repo}`);
  }

  async getCommits(
    owner: string,
    repo: string,
    options?: { branch?: string; since?: string; until?: string },
    userToken?: string,
  ): Promise<unknown[]> {
    try {
      const client = this.createUserClient(userToken);
      const params: Record<string, string> = {};
      if (options?.branch) params.sha = options.branch;
      if (options?.since) params.since = options.since;
      if (options?.until) params.until = options.until;

      const response = await client.get(`/repos/${owner}/${repo}/commits`, { params });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch commits for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getCommit(
    owner: string,
    repo: string,
    sha: string,
    userToken?: string,
  ): Promise<GithubCommitResponse | null> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get<GithubCommitResponse>(`/repos/${owner}/${repo}/commits/${sha}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch commit ${sha} for ${owner}/${repo}`, error);
      return null;
    }
  }

  async getBranches(
    owner: string,
    repo: string,
    userToken?: string,
  ): Promise<GithubBranchInfo[]> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get<GithubBranchResponse[]>(`/repos/${owner}/${repo}/branches`, {
        params: { per_page: 100 },
      });
      return response.data
        .filter((branch) => Boolean(branch.name))
        .map((branch) => ({
          name: branch.name,
          isProtected: branch.protected,
          lastCommitSha: branch.commit?.sha,
        }));
    } catch (error) {
      this.logger.error(`Failed to fetch branches for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    userToken?: string,
  ): Promise<unknown[]> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get(`/repos/${owner}/${repo}/pulls`, {
        params: { state },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch PRs for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    userToken?: string,
  ): Promise<GithubPullRequestResponse | null> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get<GithubPullRequestResponse>(
        `/repos/${owner}/${repo}/pulls/${pullNumber}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch PR #${pullNumber} for ${owner}/${repo}`, error);
      return null;
    }
  }

  async getIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    userToken?: string,
  ): Promise<unknown[]> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get(`/repos/${owner}/${repo}/issues`, {
        params: { state },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch issues for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    userToken?: string,
  ): Promise<GithubIssueResponse | null> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get<GithubIssueResponse>(
        `/repos/${owner}/${repo}/issues/${issueNumber}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch issue #${issueNumber} for ${owner}/${repo}`, error);
      return null;
    }
  }

  async searchRepositories(query: string, page = 1, perPage = 20): Promise<GithubSearchResult[]> {
    try {
      const response = await this.defaultClient.get<GithubSearchResponse>('/search/repositories', {
        params: {
          q: query,
          page,
          per_page: perPage,
          sort: 'stars',
          order: 'desc',
        },
      });
      return response.data.items;
    } catch (error) {
      this.logger.error(`Failed to search repositories: ${query}`, error);
      return [];
    }
  }

  async getUserRepositories(
    userToken: string,
    refreshToken?: string,
  ): Promise<GithubRepoResponse[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createUserClient(userToken);
        const response = await client.get<GithubRepoResponse[]>('/user/repos', {
          params: {
            sort: 'updated',
            per_page: 100,
            affiliation: 'owner,collaborator,organization_member',
          },
        });
        return response.data;
      } catch (error: any) {
        // 如果是 401 错误且有 refreshToken，尝试刷新
        if (error.response?.status === 401 && refreshToken && attempt === 1) {
          try {
            const newTokens = await this.refreshGithubToken(refreshToken);
            userToken = newTokens.accessToken;
            refreshToken = newTokens.refreshToken;
            this.logger.log('GitHub token 刷新成功，重试请求');
            continue;
          } catch (refreshError) {
            this.logger.error('GitHub token 刷新失败，用户需要重新授权');
          }
        }
        this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: getUserRepositories`);
        if (attempt === maxRetries) {
          this.logger.error('Failed to fetch user repositories after max retries', error);
          return [];
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    return [];
  }

  async getStarredRepos(
    userToken: string,
    refreshToken?: string,
  ): Promise<GithubRepoResponse[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createUserClient(userToken);
        const response = await client.get<GithubRepoResponse[]>('/user/starred', {
          params: { per_page: 100 },
        });
        return response.data;
      } catch (error: any) {
        // 如果是 401 错误且有 refreshToken，尝试刷新
        if (error.response?.status === 401 && refreshToken && attempt === 1) {
          try {
            const newTokens = await this.refreshGithubToken(refreshToken);
            userToken = newTokens.accessToken;
            refreshToken = newTokens.refreshToken;
            this.logger.log('GitHub token 刷新成功，重试请求');
            continue;
          } catch (refreshError) {
            this.logger.error('GitHub token 刷新失败，用户需要重新授权');
          }
        }
        this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: getStarredRepos`);
        if (attempt === maxRetries) {
          this.logger.error('Failed to fetch starred repositories after max retries', error);
          return [];
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    return [];
  }

  /**
   * 刷新 GitHub OAuth Token
   * 注意：GitHub OAuth 不支持 refresh_token 刷新，需要用户重新授权
   * 此方法保留用于将来支持其他 OAuth 提供商
   */
  async refreshGithubToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // GitHub OAuth App 不支持 refresh token 刷新
    // 需要用户重新进行 OAuth 授权
    this.logger.warn('GitHub OAuth 不支持 token 刷新，请引导用户重新授权');
    throw new Error('GitHub OAuth 不支持 token 刷新，请重新登录授权');
  }
}
