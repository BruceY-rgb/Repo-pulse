import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { RepositoryAccessMode, prisma } from '@repo-pulse/database';
import type { AIProvider, AIConfig, ConnectionTestResult, ModelInfo } from '@repo-pulse/shared';
import { AppConfigService } from '../app-config/app-config.service';
import axios from 'axios';

const API_URL_FALLBACK = 'http://localhost:3001';

function createFallbackAppConfigService(): AppConfigService {
  return {
    get: async (_key: string, fallback?: string) => fallback,
    resolve: async (_key: string, fallback?: string) =>
      fallback === undefined
        ? undefined
        : { value: fallback, source: 'default' as const },
    set: async () => undefined,
  } as unknown as AppConfigService;
}

// Re-export for backward compatibility
export type { AIProvider, AIConfig, ConnectionTestResult, ModelInfo } from '@repo-pulse/shared';

export interface FetchModelsResult {
  success: boolean;
  message: string;
  models: ModelInfo[];
}

export interface GithubIntegrationStatus {
  connected: boolean;
  githubLogin?: string;
  githubId?: string;
  tokenMasked?: string;
}

interface GithubTokenProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly appConfigService: AppConfigService = createFallbackAppConfigService(),
  ) {}

  /**
   * 读取当前 webhook API_URL，附带来源标识
   */
  async getApiUrlConfig(): Promise<{ value: string; source: 'db' | 'env' | 'default' }> {
    const resolved = await this.appConfigService.resolve('API_URL', API_URL_FALLBACK);
    return resolved ?? { value: API_URL_FALLBACK, source: 'default' };
  }

  /**
   * 更新 webhook API_URL 持久化到 DB
   */
  async updateApiUrlConfig(
    userId: string,
    value: string,
  ): Promise<{ value: string; source: 'db' }> {
    await this.appConfigService.set('API_URL', value, userId);
    return { value, source: 'db' };
  }

  async canUpdateApiUrlConfig(userId: string): Promise<boolean> {
    const editableRepoCount = await prisma.repository.count({
      where: {
        isActive: true,
        users: {
          some: {
            userId,
            accessMode: RepositoryAccessMode.EDITABLE,
          },
        },
      },
    });
    return editableRepoCount > 0;
  }

  async getGithubIntegrationStatus(userId: string): Promise<GithubIntegrationStatus> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        githubId: true,
        githubLogin: true,
        githubAccessToken: true,
      },
    });

    return this.toGithubIntegrationStatus(user);
  }

  async updateGithubToken(userId: string, token: string): Promise<GithubIntegrationStatus> {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      throw new BadRequestException('GitHub token is required');
    }

    const profile = await this.fetchGithubProfile(trimmedToken, {
      allowTransientFailure: true,
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        githubAccessToken: trimmedToken,
        githubRefreshToken: null,
        ...(profile
          ? {
              githubId: String(profile.id),
              githubLogin: profile.login,
              avatar: profile.avatar_url || undefined,
            }
          : {}),
      },
      select: {
        githubId: true,
        githubLogin: true,
        githubAccessToken: true,
      },
    });

    this.logger.log(
      `github_token_configured userId=${userId} login=${profile?.login ?? 'unverified'}`,
    );

    return this.toGithubIntegrationStatus(user);
  }

  async testGithubIntegration(userId: string): Promise<{ ok: boolean; login?: string; message: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return { ok: false, message: 'GitHub token is not configured' };
    }

    const profile = await this.fetchGithubProfile(user.githubAccessToken);
    if (!profile) {
      return { ok: false, message: 'Unable to read GitHub account with this token' };
    }
    return { ok: true, login: profile.login, message: 'GitHub token is valid' };
  }

  async disconnectGithub(userId: string): Promise<GithubIntegrationStatus> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        githubId: null,
        githubLogin: null,
        githubAccessToken: null,
        githubRefreshToken: null,
      },
    });
    this.logger.log(`github_token_disconnected userId=${userId}`);
    return { connected: false };
  }

  async getAIConfig(userId: string): Promise<AIConfig> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        aiProvider: true,
        aiApiKey: true,
        aiBaseUrl: true,
        aiModel: true,
      },
    });

    if (!user) {
      this.logger.warn(`User not found: ${userId}`);
      return {};
    }

    return {
      aiProvider: user.aiProvider as AIProvider | undefined,
      aiApiKey: user.aiApiKey ? '***' : undefined,
      aiBaseUrl: user.aiBaseUrl || undefined,
      aiModel: user.aiModel || undefined,
    };
  }

  private async fetchGithubProfile(
    token: string,
    options?: { allowTransientFailure?: boolean },
  ): Promise<GithubTokenProfile | null> {
    try {
      const response = await axios.get<GithubTokenProfile>('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Repo-Pulse',
        },
        // token 保存接口还要在响应内等待仓库同步，必须给 profile 校验设上限，
        // 否则会挤占全局 TimeoutInterceptor 的 30s 预算
        timeout: 10_000,
      });
      return response.data;
    } catch (error) {
      const formattedError = this.formatGithubError(error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.logger.warn('github_token_profile_auth_failed', formattedError);
        throw new BadRequestException('Invalid GitHub token');
      }

      if (options?.allowTransientFailure) {
        this.logger.warn('github_token_profile_fetch_deferred', formattedError);
        return null;
      }

      this.logger.warn('github_token_profile_fetch_failed', formattedError);
      throw new BadRequestException('Unable to read GitHub account with this token');
    }
  }

  private toGithubIntegrationStatus(user: {
    githubId: string | null;
    githubLogin: string | null;
    githubAccessToken: string | null;
  } | null): GithubIntegrationStatus {
    if (!user?.githubAccessToken) {
      return { connected: false };
    }

    return {
      connected: true,
      githubId: user.githubId || undefined,
      githubLogin: user.githubLogin || undefined,
      tokenMasked: this.maskToken(user.githubAccessToken),
    };
  }

  private maskToken(token: string) {
    if (token.length <= 8) {
      return '********';
    }
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }

  private formatGithubError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = (error.response?.data as { message?: unknown } | undefined)?.message;
      return [
        error.message,
        status ? `status=${status}` : undefined,
        typeof message === 'string' ? `githubMessage=${message}` : undefined,
      ].filter(Boolean).join(' ');
    }

    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    return String(error);
  }

  async updateAIConfig(
    userId: string,
    config: {
      aiProvider?: AIProvider;
      aiApiKey?: string;
      aiBaseUrl?: string;
      aiModel?: string;
    },
  ): Promise<AIConfig> {
    const updateData: Record<string, unknown> = {};

    if (config.aiProvider !== undefined) {
      updateData.aiProvider = config.aiProvider;
    }

    if (config.aiApiKey !== undefined) {
      if (config.aiApiKey === '***' || config.aiApiKey === '') {
      } else {
        updateData.aiApiKey = config.aiApiKey;
      }
    }

    if (config.aiBaseUrl !== undefined) {
      updateData.aiBaseUrl = config.aiBaseUrl || null;
    }

    if (config.aiModel !== undefined) {
      updateData.aiModel = config.aiModel || null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        aiProvider: true,
        aiApiKey: true,
        aiBaseUrl: true,
        aiModel: true,
      },
    });

    this.logger.log(`AI config updated for user: ${userId}`);

    return {
      aiProvider: updatedUser.aiProvider as AIProvider | undefined,
      aiApiKey: updatedUser.aiApiKey ? '***' : undefined,
      aiBaseUrl: updatedUser.aiBaseUrl || undefined,
      aiModel: updatedUser.aiModel || undefined,
    };
  }

  /**
   * 解析实际 API Key。
   * 如果前端传来掩码 '***'，从数据库读取真实 key；否则使用传入值。
   */
  async resolveApiKey(userId: string, apiKey: string): Promise<string> {
    if (apiKey === '***') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiApiKey: true },
      });
      return user?.aiApiKey || '';
    }
    return apiKey;
  }

  // @ts-ignore
  async testConnection(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
  ): Promise<ConnectionTestResult> {
    // @ts-ignore
    const { testConnection: test } = await import('@repo-pulse/ai-sdk');
    return test(provider, apiKey, baseUrl);
  }

  // @ts-ignore
  async fetchModels(
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
  ): Promise<FetchModelsResult> {
    // @ts-ignore
    const { fetchModels: fetch } = await import('@repo-pulse/ai-sdk');
    return fetch(provider, apiKey, baseUrl);
  }
}
