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
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
  fork?: boolean;
  parent?: {
    full_name: string;
    default_branch: string;
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

export interface GithubReleaseResponse {
  id: number;
  tag_name?: string;
  target_commitish?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  created_at?: string;
  author?: {
    login?: string;
    avatar_url?: string;
  } | null;
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

  private formatErrorForLog(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const method = error.config?.method?.toUpperCase();
      const url = error.config?.url;
      const data = error.response?.data as { message?: unknown } | undefined;
      const githubMessage = typeof data?.message === 'string' ? data.message : undefined;
      return [
        `AxiosError: ${error.message}`,
        status ? `status=${status}` : undefined,
        method ? `method=${method}` : undefined,
        url ? `url=${url}` : undefined,
        githubMessage ? `githubMessage=${githubMessage}` : undefined,
      ].filter(Boolean).join(' ');
    }

    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
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
      this.logger.error(`Failed to fetch repository ${owner}/${repo}`, this.formatErrorForLog(error));
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
      this.logger.error(`Failed to delete webhook for ${owner}/${repo}`, this.formatErrorForLog(error));
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

  /** 空仓库（从无 commit）时 GitHub 对 list 类接口返回 409，属正常情况而非故障，不应记为 ERROR */
  private isEmptyRepositoryError(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 409;
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
      if (this.isEmptyRepositoryError(error)) {
        this.logger.debug(`Empty repository, skipping commits: ${owner}/${repo}`);
      } else {
        this.logger.error(`Failed to fetch commits for ${owner}/${repo}`, this.formatErrorForLog(error));
      }
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
      this.logger.error(`Failed to fetch commit ${sha} for ${owner}/${repo}`, this.formatErrorForLog(error));
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
      if (this.isEmptyRepositoryError(error)) {
        this.logger.debug(`Empty repository, skipping branches: ${owner}/${repo}`);
      } else {
        this.logger.error(`Failed to fetch branches for ${owner}/${repo}`, this.formatErrorForLog(error));
      }
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
      if (this.isEmptyRepositoryError(error)) {
        this.logger.debug(`Empty repository, skipping PRs: ${owner}/${repo}`);
      } else {
        this.logger.error(`Failed to fetch PRs for ${owner}/${repo}`, this.formatErrorForLog(error));
      }
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
      this.logger.error(`Failed to fetch PR #${pullNumber} for ${owner}/${repo}`, this.formatErrorForLog(error));
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
      if (this.isEmptyRepositoryError(error)) {
        this.logger.debug(`Empty repository, skipping issues: ${owner}/${repo}`);
      } else {
        this.logger.error(`Failed to fetch issues for ${owner}/${repo}`, this.formatErrorForLog(error));
      }
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
      this.logger.error(`Failed to fetch issue #${issueNumber} for ${owner}/${repo}`, this.formatErrorForLog(error));
      return null;
    }
  }

  async getReleases(
    owner: string,
    repo: string,
    options?: { since?: string },
    userToken?: string,
  ): Promise<GithubReleaseResponse[]> {
    try {
      const client = this.createUserClient(userToken);
      const releases: GithubReleaseResponse[] = [];
      const sinceMs = options?.since ? Date.parse(options.since) : Number.NaN;
      let page = 1;

      while (page <= 5) {
        const response = await client.get<GithubReleaseResponse[]>(
          `/repos/${owner}/${repo}/releases`,
          { params: { per_page: 100, page } },
        );
        const pageItems = Array.isArray(response.data) ? response.data : [];
        releases.push(...pageItems);

        const reachedOlderPage =
          Number.isFinite(sinceMs) &&
          pageItems.some((release) => {
            const releaseMs = Date.parse(
              release.published_at ?? release.created_at ?? '',
            );
            return Number.isFinite(releaseMs) && releaseMs < sinceMs;
          });

        if (pageItems.length < 100 || reachedOlderPage) {
          break;
        }
        page += 1;
      }

      return releases;
    } catch (error) {
      if (this.isEmptyRepositoryError(error)) {
        this.logger.debug(`Empty repository, skipping releases: ${owner}/${repo}`);
      } else {
        this.logger.error(`Failed to fetch releases for ${owner}/${repo}`, this.formatErrorForLog(error));
      }
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
      this.logger.error(`Failed to search repositories: ${query}`, this.formatErrorForLog(error));
      return [];
    }
  }

  async getUserRepositories(
    userToken: string,
    refreshToken?: string,
    options?: { throwOnError?: boolean },
  ): Promise<GithubRepoResponse[]> {
    const maxRetries = 3;
    let currentUserToken = userToken;
    let currentRefreshToken = refreshToken;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createUserClient(currentUserToken);
        const allRepos: GithubRepoResponse[] = [];
        let page = 1;
        const perPage = 100;
        while (true) {
          const response = await client.get<GithubRepoResponse[]>('/user/repos', {
            params: {
              sort: 'updated',
              per_page: perPage,
              page,
              affiliation: 'owner,collaborator,organization_member',
            },
          });
          allRepos.push(...response.data);
          if (response.data.length < perPage) {
            break;
          }
          page++;
        }
        return allRepos;
      } catch (error: any) {
        // 如果是 401 错误且有 refreshToken，尝试刷新
        if (error.response?.status === 401 && currentRefreshToken && attempt === 1) {
          try {
            const newTokens = await this.refreshGithubToken(currentRefreshToken);
            currentUserToken = newTokens.accessToken;
            currentRefreshToken = newTokens.refreshToken;
            this.logger.log('GitHub token 刷新成功，重试请求');
            continue;
          } catch (refreshError) {
            this.logger.error('GitHub token 刷新失败，用户需要重新授权');
          }
        }
        this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: getUserRepositories`);
        if (attempt === maxRetries) {
          this.logger.error('Failed to fetch user repositories after max retries', this.formatErrorForLog(error));
          if (options?.throwOnError) {
            throw error;
          }
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
    options?: { throwOnError?: boolean },
  ): Promise<GithubRepoResponse[]> {
    const maxRetries = 3;
    let currentUserToken = userToken;
    let currentRefreshToken = refreshToken;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createUserClient(currentUserToken);
        const allRepos: GithubRepoResponse[] = [];
        let page = 1;
        const perPage = 100;
        while (true) {
          const response = await client.get<GithubRepoResponse[]>('/user/starred', {
            params: { per_page: perPage, page },
          });
          allRepos.push(...response.data);
          if (response.data.length < perPage) {
            break;
          }
          page++;
        }
        return allRepos;
      } catch (error: any) {
        // 如果是 401 错误且有 refreshToken，尝试刷新
        if (error.response?.status === 401 && currentRefreshToken && attempt === 1) {
          try {
            const newTokens = await this.refreshGithubToken(currentRefreshToken);
            currentUserToken = newTokens.accessToken;
            currentRefreshToken = newTokens.refreshToken;
            this.logger.log('GitHub token 刷新成功，重试请求');
            continue;
          } catch (refreshError) {
            this.logger.error('GitHub token 刷新失败，用户需要重新授权');
          }
        }
        this.logger.warn(`Attempt ${attempt}/${maxRetries} failed: getStarredRepos`);
        if (attempt === maxRetries) {
          this.logger.error('Failed to fetch starred repositories after max retries', this.formatErrorForLog(error));
          if (options?.throwOnError) {
            throw error;
          }
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

  async getContributors(owner: string, repo: string, userToken?: string): Promise<Array<{ login: string; avatar_url: string; html_url: string }>> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get<Array<{ login: string; avatar_url: string; html_url: string }>>(`/repos/${owner}/${repo}/contributors`, {
        params: { per_page: 100 },
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      this.logger.error(`Failed to fetch contributors for ${owner}/${repo}`, this.formatErrorForLog(error));
      return [];
    }
  }

  /**
   * 对比两个分支
   * @param base 基准分支
   * @param head 对比分支
   */
  async compareBranches(
    owner: string,
    repo: string,
    base: string,
    head: string,
    userToken?: string,
  ): Promise<any> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.get(`/repos/${owner}/${repo}/compare/${base}...${head}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to compare branches ${base}...${head} for ${owner}/${repo}`,
        this.formatErrorForLog(error),
      );
      return null;
    }
  }

  async starRepository(
    owner: string,
    repo: string,
    userToken: string,
  ): Promise<boolean> {
    try {
      const client = this.createUserClient(userToken);
      await client.put(`/user/starred/${owner}/${repo}`, null, {
        headers: {
          'Content-Length': '0',
        },
      });
      this.logger.log(`Starred repository ${owner}/${repo} successfully`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to star repository ${owner}/${repo}`,
        this.formatErrorForLog(error),
      );
      return false;
    }
  }

  /**
   * 合并 Pull Request
   * @param userToken 用户的 OAuth Token（必须有 write 权限）
   */
  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    userToken: string,
  ): Promise<{ merged: boolean; message: string }> {
    try {
      const client = this.createUserClient(userToken);
      const response = await client.put<{ merged: boolean; message: string }>(
        `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      );
      this.logger.log(`PR #${pullNumber} merged for ${owner}/${repo}`);
      return {
        merged: response.data.merged,
        message: response.data.message || 'PR merged successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to merge PR #${pullNumber} for ${owner}/${repo}`,
        this.formatErrorForLog(error),
      );
      throw error;
    }
  }
}
