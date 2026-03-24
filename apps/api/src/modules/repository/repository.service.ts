import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Platform, Repository } from '@repo-pulse/database';
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

  async create(userId: string, dto: CreateRepositoryDto) {
    const { platform, owner, repo, name } = dto;

    // 获取仓库信息
    let repoInfo: {
      externalId: string;
      name: string;
      fullName: string;
      url: string;
      defaultBranch: string;
    };

    if (platform === Platform.GITHUB) {
      const githubRepo = await this.githubService.getRepository(owner, repo);
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

    // 生成 webhook secret
    const webhookSecret = this.generateWebhookSecret();

    // 创建仓库记录
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

    // 关联用户
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

    // 注册 Webhook
    if (platform === Platform.GITHUB) {
      const webhookUrl = `${this.configService.get<string>('APP_URL')}/webhooks/github`;
      await this.githubService.createWebhook(owner, repo, webhookUrl, webhookSecret);
    } else {
      const webhookUrl = `${this.configService.get<string>('APP_URL')}/webhooks/gitlab`;
      await this.gitlabService.createWebhook(owner, repo, webhookUrl, webhookSecret);
    }

    this.logger.log(`Repository ${repoInfo.fullName} created/updated successfully`);

    return repository;
  }

  async findAll(userId: string, options?: { isActive?: boolean }) {
    const where: Record<string, unknown> = {};

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
        ...where,
      },
      include: {
        _count: {
          select: {
            events: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return repositories;
  }

  async findById(id: string): Promise<any> {
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        events: {
          take: 10,
          orderBy: {
            createdAt: 'desc',
          },
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

    return repository;
  }

  async update(id: string, dto: UpdateRepositoryDto) {
    const repository = await this.prisma.repository.update({
      where: { id },
      data: dto,
    });

    return repository;
  }

  async delete(id: string) {
    await this.prisma.repository.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  }

  async sync(id: string): Promise<any> {
    const repository = await this.findById(id);

    // TODO: 实现从 GitHub/GitLab 同步历史事件
    await this.prisma.repository.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
      },
    });

    return repository;
  }

  async getUserRepositories(userId: string) {
    return this.prisma.userRepository.findMany({
      where: { userId },
      include: {
        repository: true,
      },
    });
  }

  private generateWebhookSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }
}
