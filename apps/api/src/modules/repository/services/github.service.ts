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
   */
  async createWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string,
    userToken?: string,
  ): Promise<number | null> {
    try {
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
    } catch (error) {
      this.logger.error(`Failed to create webhook for ${owner}/${repo}`, error);
      // 不抛出异常，让调用方决定如何处理
      return null;
    }
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

  async getUserRepositories(userToken: string): Promise<GithubRepoResponse[]> {
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
      } catch (error) {
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

  async getStarredRepos(userToken: string): Promise<GithubRepoResponse[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createUserClient(userToken);
        const response = await client.get<GithubRepoResponse[]>('/user/starred', {
          params: { per_page: 100 },
        });
        return response.data;
      } catch (error) {
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
}
