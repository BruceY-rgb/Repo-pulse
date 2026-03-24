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

interface GithubWebhookConfig {
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly client: AxiosInstance;
  private readonly apiUrl = 'https://api.github.com';

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('GITHUB_TOKEN');
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  }

  async getRepository(owner: string, repo: string): Promise<GithubRepoResponse> {
    try {
      const response = await this.client.get<GithubRepoResponse>(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch repository ${owner}/${repo}`, error);
      throw new Error(`无法获取仓库 ${owner}/${repo}`);
    }
  }

  async createWebhook(
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string,
  ): Promise<void> {
    try {
      const config: GithubWebhookConfig = {
        url: webhookUrl,
        secret,
        events: [
          'push',
          'pull_request',
          'issues',
          'issue_comment',
          'release',
          'create',
          'delete',
        ],
        active: true,
      };

      await this.client.post(`/repos/${owner}/${repo}/hooks`, config);
      this.logger.log(`Webhook created for ${owner}/${repo}`);
    } catch (error) {
      this.logger.error(`Failed to create webhook for ${owner}/${repo}`, error);
      throw new Error('创建 Webhook 失败');
    }
  }

  async deleteWebhook(owner: string, repo: string, webhookId: string): Promise<void> {
    try {
      await this.client.delete(`/repos/${owner}/${repo}/hooks/${webhookId}`);
      this.logger.log(`Webhook deleted for ${owner}/${repo}`);
    } catch (error) {
      this.logger.error(`Failed to delete webhook for ${owner}/${repo}`, error);
    }
  }

  async getCommits(
    owner: string,
    repo: string,
    options?: { branch?: string; since?: string; until?: string },
  ): Promise<unknown[]> {
    try {
      const params: Record<string, string> = {};
      if (options?.branch) {
        params.sha = options.branch;
      }
      if (options?.since) {
        params.since = options.since;
      }
      if (options?.until) {
        params.until = options.until;
      }

      const response = await this.client.get(`/repos/${owner}/${repo}/commits`, { params });
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
  ): Promise<unknown[]> {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/pulls`, {
        params: { state },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch PRs for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<unknown[]> {
    try {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues`, {
        params: { state },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch issues for ${owner}/${repo}`, error);
      return [];
    }
  }

  /**
   * 搜索公开仓库
   */
  async searchRepositories(query: string, page = 1, perPage = 20): Promise<GithubSearchResult[]> {
    try {
      const response = await this.client.get<GithubSearchResponse>('/search/repositories', {
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

  /**
   * 获取用户作为 contributor 的仓库
   * 需要用户的 GitHub OAuth token
   */
  async getUserRepositories(userToken: string): Promise<GithubRepoResponse[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const userClient = axios.create({
          baseURL: this.apiUrl,
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${userToken}`,
          },
        });
        const response = await userClient.get<GithubRepoResponse[]>('/user/repos', {
          params: {
            sort: 'updated',
            per_page: 100,
            // 获取用户拥有、合作、组织成员的仓库
            affiliation: 'owner,collaborator,organization_member',
          },
        });
        return response.data;
      } catch (error) {
        this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: Failed to fetch user repositories`);
        if (attempt === maxRetries) {
          this.logger.error('Failed to fetch user repositories', error);
          return [];
        }
        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    return [];
  }

  /**
   * 获取用户 star 过的仓库
   * 需要用户的 GitHub OAuth token
   */
  async getStarredRepos(userToken: string): Promise<GithubRepoResponse[]> {
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const userClient = axios.create({
          baseURL: this.apiUrl,
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${userToken}`,
          },
        });
        const response = await userClient.get<GithubRepoResponse[]>('/user/starred', {
          params: {
            per_page: 100,
          },
        });
        return response.data;
      } catch (error) {
        this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: Failed to fetch starred repositories`);
        if (attempt === maxRetries) {
          this.logger.error('Failed to fetch starred repositories', error);
          return [];
        }
        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    return [];
  }
}
