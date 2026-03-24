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
}
