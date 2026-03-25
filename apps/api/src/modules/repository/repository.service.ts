import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Platform, Repository } from '@repo-pulse/database';
import { randomBytes } from 'crypto';
import { GithubService } from './services/github.service';
import { GitlabService } from './services/gitlab.service';
import { CreateRepositoryDto, UpdateRepositoryDto } from './dto/repository.dto';

@Injectable()
export class RepositoryService {
  private readonly logger = new Logger(RepositoryService.name);
  private prisma: PrismaClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly githubService: GithubService,
    private readonly gitlabService: GitlabService,
  ) {
    this.prisma = new PrismaClient();
  }

  /**
   * 添加仓库并注册 Webhook
   * @param userId 当前用户 ID
   * @param dto 仓库信息
   * @param userOAuthToken 当前用户的 GitHub/GitLab OAuth Token，用于以用户身份注册 Webhook
   */
  async create(userId: string, dto: CreateRepositoryDto, userOAuthToken?: string) {
    const { platform, owner, repo } = dto;

    // 1. 获取仓库基本信息
    let repoInfo: {
      externalId: string;
      name: string;
      fullName: string;
      url: string;
      defaultBranch: string;
    };

    if (platform === Platform.GITHUB) {
      const githubRepo = await this.githubService.getRepository(owner, repo, userOAuthToken);
      repoInfo = {
        externalId: String(githubRepo.id),
        name: githubRepo.name,
        fullName: githubRepo.full_name,
        url: githubRepo.html_url,
        defaultBranch: githubRepo.default_branch || 'main',
      };
    } else {
      const gitlabRepo = await this.gitlabService.getRepository(owner, repo);
      repoInfo = {
        externalId: String(gitlabRepo.id),
        name: gitlabRepo.name,
        fullName: gitlabRepo.path_with_namespace,
        url: gitlabRepo.web_url,
        defaultBranch: gitlabRepo.default_branch || 'main',
      };
    }

    // 2. 生成仓库专属 Webhook Secret（使用加密安全的随机数）
    const webhookSecret = this.generateWebhookSecret();

    // 3. 创建或更新仓库记录
    const repository = await this.prisma.repository.upsert({
      where: {
        platform_externalId: {
          platform,
          externalId: repoInfo.externalId,
        },
      },
      update: {
        isActive: true,
        webhookSecret,
      },
      create: {
        name: repoInfo.name,
        fullName: repoInfo.fullName,
        platform,
        externalId: repoInfo.externalId,
        url: repoInfo.url,
        defaultBranch: repoInfo.defaultBranch,
        webhookSecret,
      },
    });

    // 4. 关联用户与仓库
    await this.prisma.userRepository.upsert({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
      update: {},
      create: {
        userId,
        repositoryId: repository.id,
        role: 'ADMIN' as const,
      },
    });

    // 5. 注册 Webhook（使用 API_URL 生成回调地址）
    const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
    try {
      if (platform === Platform.GITHUB) {
        const webhookUrl = `${apiUrl}/webhooks/github`;
        const webhookId = await this.githubService.createWebhook(
          owner,
          repo,
          webhookUrl,
          webhookSecret,
          userOAuthToken,
        );
        // 保存 webhookId 以便后续删除
        if (webhookId) {
          await this.prisma.repository.update({
            where: { id: repository.id },
            data: { webhookId: String(webhookId) },
          });
        }
      } else {
        const webhookUrl = `${apiUrl}/webhooks/gitlab`;
        await this.gitlabService.createWebhook(owner, repo, webhookUrl, webhookSecret);
      }
    } catch (error) {
      this.logger.error(`Failed to register webhook for ${repoInfo.fullName}`, error);
      // Webhook 注册失败不影响仓库记录的创建，但需要记录日志
    }

    this.logger.log(`Repository ${repoInfo.fullName} added successfully for user ${userId}`);
    return repository;
  }

  async findAll(userId: string, options?: { isActive?: boolean }) {
    const where: Record<string, unknown> = {};

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    return this.prisma.repository.findMany({
      where: {
        users: {
          some: { userId },
        },
        ...where,
      },
      include: {
        _count: {
          select: { events: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<Repository & Record<string, unknown>> {
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        events: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('仓库不存在');
    }

    return repository as Repository & Record<string, unknown>;
  }

  async update(id: string, dto: UpdateRepositoryDto) {
    return this.prisma.repository.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.prisma.repository.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  async sync(id: string) {
    const repository = await this.findById(id);

    // TODO: Phase 2.2 — 实现从 GitHub/GitLab 同步历史事件
    await this.prisma.repository.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });

    return repository;
  }

  async getUserRepositories(userId: string) {
    return this.prisma.userRepository.findMany({
      where: { userId },
      include: { repository: true },
    });
  }

  async searchRepositories(query: string, page = 1) {
    const results = await this.githubService.searchRepositories(query, page);
    return results.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      stargazersCount: repo.stargazers_count,
      language: repo.language,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
      platform: 'GITHUB' as const,
    }));
  }

  /**
   * 获取用户自己的 GitHub 仓库列表（使用用户 OAuth Token）
   */
  async searchUserRepositories(userOAuthToken: string) {
    if (!userOAuthToken) {
      this.logger.warn('未提供用户 OAuth Token，无法获取用户仓库');
      return [];
    }

    const repos = await this.githubService.getUserRepositories(userOAuthToken);
    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      stargazersCount: repo.stargazers_count,
      language: repo.language,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
      platform: 'GITHUB' as const,
    }));
  }

  /**
   * 获取用户 Star 的仓库（使用用户 OAuth Token）
   */
  async searchStarredRepositories(userOAuthToken: string) {
    if (!userOAuthToken) {
      this.logger.warn('未提供用户 OAuth Token，无法获取 starred 仓库');
      return [];
    }

    const repos = await this.githubService.getStarredRepos(userOAuthToken);
    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      htmlUrl: repo.html_url,
      stargazersCount: repo.stargazers_count,
      language: repo.language,
      owner: {
        login: repo.owner.login,
        avatarUrl: repo.owner.avatar_url,
      },
      platform: 'GITHUB' as const,
    }));
  }

  /**
   * 使用加密安全的随机数生成仓库专属 Webhook Secret
   */
  private generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }
}
