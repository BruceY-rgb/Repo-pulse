import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface GitlabRepoResponse {
  id: number;
  name: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
  owner: {
    id: number;
    name: string;
    avatar_url: string;
  };
}

interface GitlabWebhookConfig {
  url: string;
  token: string;
  push_events: boolean;
  merge_requests_events: boolean;
  issues_events: boolean;
  note_events: boolean;
  tag_push_events: boolean;
}

interface GitlabBranchResponse {
  name: string;
}

export interface GitlabCommitResponse {
  id: string;
  message?: string;
  web_url?: string;
  author_name?: string;
  authored_date?: string;
  committed_date?: string;
  created_at?: string;
}

export interface GitlabMergeRequestResponse {
  id: number;
  iid: number;
  title?: string;
  description?: string | null;
  web_url?: string;
  state?: string;
  merged_at?: string | null;
  closed_at?: string | null;
  updated_at?: string;
  created_at?: string;
  author?: {
    username?: string;
    avatar_url?: string;
  };
}

export interface GitlabIssueResponse {
  id: number;
  iid: number;
  title?: string;
  description?: string | null;
  web_url?: string;
  state?: string;
  closed_at?: string | null;
  updated_at?: string;
  created_at?: string;
  author?: {
    username?: string;
    avatar_url?: string;
  };
}

@Injectable()
export class GitlabService {
  private readonly logger = new Logger(GitlabService.name);
  private readonly client: AxiosInstance;
  private readonly apiUrl = 'https://gitlab.com/api/v4';

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('GITLAB_TOKEN');
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        ...(token && { 'PRIVATE-TOKEN': token }),
      },
    });
  }

  async getRepository(owner: string, repo: string): Promise<GitlabRepoResponse> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await this.client.get<GitlabRepoResponse>(`/projects/${encodedPath}`);
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
    token: string,
  ): Promise<number> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const config: GitlabWebhookConfig = {
        url: webhookUrl,
        token,
        push_events: true,
        merge_requests_events: true,
        issues_events: true,
        note_events: true,
        tag_push_events: true,
      };

      const response = await this.client.post(`/projects/${encodedPath}/hooks`, config);
      this.logger.log(`Webhook created for ${owner}/${repo}`);
      return response.data.id;
    } catch (error) {
      this.logger.error(`Failed to create webhook for ${owner}/${repo}`, error);
      throw new Error('创建 Webhook 失败');
    }
  }

  async deleteWebhook(owner: string, repo: string, webhookId: number): Promise<void> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      await this.client.delete(`/projects/${encodedPath}/hooks/${webhookId}`);
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
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const params: Record<string, string> = {};
      if (options?.branch) {
        params.ref_name = options.branch;
      }
      if (options?.since) {
        params.since = options.since;
      }
      if (options?.until) {
        params.until = options.until;
      }

      const response = await this.client.get(`/projects/${encodedPath}/repository/commits`, {
        params,
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch commits for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<GitlabCommitResponse | null> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await this.client.get<GitlabCommitResponse>(
        `/projects/${encodedPath}/repository/commits/${encodeURIComponent(sha)}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch commit ${sha} for ${owner}/${repo}`, error);
      return null;
    }
  }

  async getBranches(owner: string, repo: string): Promise<string[]> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await this.client.get<GitlabBranchResponse[]>(
        `/projects/${encodedPath}/repository/branches`,
        {
          params: { per_page: 100 },
        },
      );
      return response.data.map((branch) => branch.name).filter(Boolean);
    } catch (error) {
      this.logger.error(`Failed to fetch branches for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getMergeRequests(
    owner: string,
    repo: string,
    state: 'opened' | 'closed' | 'all' = 'all',
  ): Promise<unknown[]> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await this.client.get(`/projects/${encodedPath}/merge_requests`, {
        params: { state },
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch MRs for ${owner}/${repo}`, error);
      return [];
    }
  }

  async getMergeRequest(
    owner: string,
    repo: string,
    mergeRequestIid: number,
  ): Promise<GitlabMergeRequestResponse | null> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await this.client.get<GitlabMergeRequestResponse>(
        `/projects/${encodedPath}/merge_requests/${mergeRequestIid}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch MR !${mergeRequestIid} for ${owner}/${repo}`, error);
      return null;
    }
  }

  async getIssues(
    owner: string,
    repo: string,
    state: 'opened' | 'closed' | 'all' = 'all',
  ): Promise<unknown[]> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await this.client.get(`/projects/${encodedPath}/issues`, {
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
    issueIid: number,
  ): Promise<GitlabIssueResponse | null> {
    try {
      const encodedPath = encodeURIComponent(`${owner}/${repo}`);
      const response = await this.client.get<GitlabIssueResponse>(
        `/projects/${encodedPath}/issues/${issueIid}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch issue #${issueIid} for ${owner}/${repo}`, error);
      return null;
    }
  }
}
