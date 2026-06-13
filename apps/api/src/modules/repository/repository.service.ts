import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EventType,
  Platform,
  PrismaClient,
  Repository,
  RepositoryAccessLevel,
  RepositoryAccessMode,
  Role,
} from '@repo-pulse/database';
import { WebhookStatus } from '@repo-pulse/shared';
import { randomBytes } from 'crypto';
import {
  assertUserCanAccessRepository,
  assertUserCanEditRepository,
  getUserMonitoredRepositoryIds,
  isEditableRepositoryAccessLevel,
} from '../../common/utils/repository-access';
import { EventService } from '../event/event.service';
import { EventGateway } from '../event/event.gateway';
import { CreateRepositoryDto, UpdateRepositoryDto } from './dto/repository.dto';
import {
  GithubBranchInfo,
  GithubReleaseResponse,
  GithubRepoResponse,
  GithubService,
} from './services/github.service';
import { GitlabBranchInfo, GitlabReleaseResponse, GitlabService } from './services/gitlab.service';
import { AppConfigService } from '../app-config/app-config.service';

const API_URL_FALLBACK = 'http://localhost:3001';
const RELEASE_SYNC_LOOKBACK_DAYS = 365;

type EventPostCreateOptions = {
  broadcast?: boolean;
  notify?: boolean;
  analyze?: boolean;
};

export interface WebhookProvisionResult {
  webhookStatus: WebhookStatus;
  webhookError?: string;
  webhookId?: string | null;
}

export type RepositoryWithWebhookStatus = Repository & WebhookProvisionResult;

interface WebhookLastResponseLike {
  code?: number | null;
  status?: string | null;
  message?: string | null;
}

function createFallbackAppConfigService(configService: ConfigService): AppConfigService {
  return {
    get: async (key: string, fallback?: string) =>
      configService.get<string>(key) ?? fallback,
    resolve: async (key: string, fallback?: string) => {
      const value = configService.get<string>(key);
      if (value) {
        return { value, source: 'env' as const };
      }
      return fallback === undefined
        ? undefined
        : { value: fallback, source: 'default' as const };
    },
    set: async () => undefined,
  } as unknown as AppConfigService;
}

function resolveGithubWebhookDeliveryStatus(
  active: boolean,
  lastResponse?: WebhookLastResponseLike | null,
): { status: WebhookStatus; lastError: string | null } {
  if (!active) {
    return { status: WebhookStatus.FAILED, lastError: null };
  }

  if (!lastResponse) {
    return { status: WebhookStatus.ACTIVE, lastError: null };
  }

  const code = lastResponse.code;
  const responseStatus = lastResponse.status?.trim() ?? '';
  const message = lastResponse.message?.trim() ?? '';
  const statusText = responseStatus.toLowerCase();
  const errorMessage = message || responseStatus || null;

  if (typeof code === 'number' && (code < 200 || code >= 300)) {
    return { status: WebhookStatus.FAILED, lastError: errorMessage };
  }

  if (
    code === null &&
    errorMessage &&
    statusText !== 'ok' &&
    statusText !== 'unused'
  ) {
    return { status: WebhookStatus.FAILED, lastError: errorMessage };
  }

  return { status: WebhookStatus.ACTIVE, lastError: null };
}

interface SyncSummary {
  repositoryId: string;
  createdCount: number;
  skippedCount: number;
  updatedCount: number;
  failedSources: string[];
  lastSyncAt: string;
}

export interface RepositoryBranchOption {
  name: string;
  isDefault: boolean;
  isObserved: boolean;
  isProtected?: boolean;
  lastCommitSha?: string;
}

interface NormalizedSyncEvent {
  type: EventType;
  action: string;
  title: string;
  body?: string;
  author: string;
  authorAvatar?: string;
  externalId: string;
  externalUrl?: string;
  branch?: string;
  sourceBranch?: string;
  targetBranch?: string;
  branches?: string[];
  occurredAt: Date;
  metadata: Record<string, unknown>;
}

type RepositoryAccessLevelApi =
  | 'owner'
  | 'admin'
  | 'maintain'
  | 'write'
  | 'triage'
  | 'read'
  | 'none';

type RepositoryMembershipView = {
  role?: Role | string;
  accessMode?: RepositoryAccessMode | null;
  accessLevel?: RepositoryAccessLevel | null;
};

@Injectable()
export class RepositoryService {
  private readonly logger = new Logger(RepositoryService.name);
  private prisma: PrismaClient;
  private readonly contributorsCache = new Map<string, { data: any[]; expiry: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly githubService: GithubService,
    private readonly gitlabService: GitlabService,
    private readonly eventService: EventService,
    private readonly appConfigService: AppConfigService = createFallbackAppConfigService(configService),
    @Optional() private readonly eventGateway?: EventGateway,
  ) {
    this.prisma = new PrismaClient();
  }

  async create(
    userId: string,
    dto: CreateRepositoryDto,
    options?: {
      userOAuthToken?: string;
      accessMode?: RepositoryAccessMode;
      accessLevel?: RepositoryAccessLevel;
      role?: Role;
      githubLogin?: string;
      isStarred?: boolean;
    },
  ) {
    const { platform, owner, repo } = dto;

    let repoInfo: {
      externalId: string;
      name: string;
      fullName: string;
      url: string;
      defaultBranch: string;
    };
    let accessLevel = options?.accessLevel ?? RepositoryAccessLevel.WRITE;

    if (platform === Platform.GITHUB) {
      const githubRepo = await this.githubService.getRepository(
        owner,
        repo,
        options?.userOAuthToken,
      );
      repoInfo = {
        externalId: String(githubRepo.id),
        name: githubRepo.name,
        fullName: githubRepo.full_name,
        url: githubRepo.html_url,
        defaultBranch: githubRepo.default_branch || 'main',
      };
      accessLevel =
        options?.accessLevel ??
        this.resolveGithubAccessLevel(githubRepo, options?.githubLogin);
    } else {
      const gitlabRepo = await this.gitlabService.getRepository(owner, repo);
      repoInfo = {
        externalId: String(gitlabRepo.id),
        name: gitlabRepo.name,
        fullName: gitlabRepo.path_with_namespace,
        url: gitlabRepo.web_url,
        defaultBranch: gitlabRepo.default_branch || 'main',
      };
      accessLevel = options?.accessLevel ?? RepositoryAccessLevel.WRITE;
    }

    const accessMode =
      options?.accessMode ?? this.resolveAccessModeFromLevel(accessLevel);
    const shouldRegisterWebhook = accessMode === RepositoryAccessMode.EDITABLE;
    const webhookSecret = shouldRegisterWebhook ? this.generateWebhookSecret() : null;
    const role =
      options?.role ??
      (isEditableRepositoryAccessLevel(accessLevel) ? 'ADMIN' : 'VIEWER');

    const repository = await this.prisma.repository.upsert({
      where: {
        platform_externalId: {
          platform,
          externalId: repoInfo.externalId,
        },
      },
      update: {
        isActive: true,
        ...(shouldRegisterWebhook ? { webhookSecret } : {}),
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

    await this.prisma.userRepository.upsert({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
      update: {
        accessMode,
        accessLevel,
        role,
        ...(options?.isStarred !== undefined ? { isStarred: options.isStarred } : {}),
      },
      create: {
        userId,
        repositoryId: repository.id,
        role,
        accessMode,
        accessLevel,
        isStarred: options?.isStarred ?? false,
      },
    });

    if (options?.isStarred && platform === Platform.GITHUB && options?.userOAuthToken) {
      try {
        await this.githubService.starRepository(owner, repo, options.userOAuthToken);
      } catch (error) {
        this.logger.error(`Failed to star repository ${repoInfo.fullName} on GitHub`, error);
      }
    }

    let finalRepository: typeof repository = repository;
    let provision: WebhookProvisionResult | null = null;
    if (shouldRegisterWebhook) {
      const editableWebhookSecret = webhookSecret ?? this.generateWebhookSecret();
      provision = await this.provisionWebhook({
        platform,
        owner,
        repo,
        repositoryId: repository.id,
        repositoryFullName: repoInfo.fullName,
        webhookSecret: editableWebhookSecret,
        userOAuthToken: options?.userOAuthToken,
      });
      finalRepository = provision.webhookId
        ? { ...repository, webhookId: provision.webhookId }
        : repository;
    }

    this.logger.log(
      `Repository ${repoInfo.fullName} added successfully for user ${userId} with accessLevel=${accessLevel}`,
    );

    return {
      ...this.attachRepositoryAccessView(finalRepository, {
        role,
        accessMode,
        accessLevel,
      }),
      ...(provision
        ? {
            webhookStatus: provision.webhookStatus,
            webhookError: provision.webhookError,
          }
        : {}),
    };
  }

  /**
   * 创建或更新仓库的 webhook，返回状态与错误码（不抛异常）
   * 调用方：create() 创建仓库时，retry 端点重试时
   */
  async provisionWebhook(params: {
    platform: Platform;
    owner: string;
    repo: string;
    repositoryId: string;
    repositoryFullName: string;
    webhookSecret: string;
    userOAuthToken?: string;
  }): Promise<WebhookProvisionResult> {
    const apiUrl = (await this.appConfigService.get('API_URL', API_URL_FALLBACK)) ?? API_URL_FALLBACK;

    if (params.platform === Platform.GITHUB) {
      const webhookUrl = `${apiUrl}/webhooks/github`;
      try {
        const webhookId = await this.githubService.createWebhook(
          params.owner,
          params.repo,
          webhookUrl,
          params.webhookSecret,
          params.userOAuthToken,
        );
        const webhookIdStr = String(webhookId);
        await this.persistWebhookState(params.repositoryId, {
          webhookId: webhookIdStr,
          webhookStatus: WebhookStatus.ACTIVE,
          webhookError: null,
        });
        await this.pruneStaleGithubWebhooks({
          owner: params.owner,
          repo: params.repo,
          keepWebhookId: webhookIdStr,
          userOAuthToken: params.userOAuthToken,
          repositoryFullName: params.repositoryFullName,
        });
        return {
          webhookStatus: WebhookStatus.ACTIVE,
          webhookId: webhookIdStr,
        };
      } catch (error) {
        // 自愈：GitHub 报 "Hook already exists" 时，找到旧 webhook → 删除 → 重新用当前 secret 建
        if (this.isHookAlreadyExistsError(error)) {
          const healed = await this.healExistingWebhook({
            owner: params.owner,
            repo: params.repo,
            webhookUrl,
            webhookSecret: params.webhookSecret,
            userOAuthToken: params.userOAuthToken,
            repositoryId: params.repositoryId,
            repositoryFullName: params.repositoryFullName,
          });
          if (healed) {
            return healed;
          }
        }

        const classified = this.classifyWebhookError(error, params.repositoryFullName);
        // create 路径下，GitHub 对"无 admin 权限"的仓库返回 404 而非 403；
        // 而创建仓库时上游 getRepository 已确认仓库存在，所以此处 NOT_FOUND 实为权限问题
        const finalStatus =
          classified.webhookStatus === WebhookStatus.NOT_FOUND
            ? WebhookStatus.INSUFFICIENT_SCOPE
            : classified.webhookStatus;
        await this.persistWebhookState(params.repositoryId, {
          webhookStatus: finalStatus,
          webhookError: classified.webhookError ?? null,
        });
        return { webhookStatus: finalStatus, webhookError: classified.webhookError };
      }
    }

    try {
      const webhookUrl = `${apiUrl}/webhooks/gitlab`;
      await this.gitlabService.createWebhook(
        params.owner,
        params.repo,
        webhookUrl,
        params.webhookSecret,
      );
      await this.persistWebhookState(params.repositoryId, {
        webhookStatus: WebhookStatus.ACTIVE,
        webhookError: null,
      });
      return { webhookStatus: WebhookStatus.ACTIVE };
    } catch (error) {
      const classified = this.classifyWebhookError(error, params.repositoryFullName);
      await this.persistWebhookState(params.repositoryId, {
        webhookStatus: classified.webhookStatus,
        webhookError: classified.webhookError ?? null,
      });
      return classified;
    }
  }

  private async persistWebhookState(
    repositoryId: string,
    patch: { webhookId?: string | null; webhookStatus: WebhookStatus; webhookError: string | null },
  ) {
    const data: { webhookId?: string | null; webhookStatus: string; webhookError: string | null } = {
      webhookStatus: patch.webhookStatus,
      webhookError: patch.webhookError,
    };
    if (patch.webhookId !== undefined) {
      data.webhookId = patch.webhookId;
    }
    await this.prisma.repository.update({
      where: { id: repositoryId },
      data,
    });
  }

  /** 仓库新增/更新/webhook 状态变更后，向该用户 Room 推送 repository.updated（非致命）。 */
  private emitRepositoryUpdated(userId: string, repositoryId: string): void {
    try {
      this.eventGateway?.broadcastRepositoryUpdated({ userId, repositoryId });
    } catch (error) {
      this.logger.warn(
        `repository_updated_broadcast_failed repo=${repositoryId} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }

  /** 仓库删除后，向该用户 Room 推送 repository.deleted（非致命）。 */
  private emitRepositoryDeleted(userId: string, repositoryId: string): void {
    try {
      this.eventGateway?.broadcastRepositoryDeleted({ userId, repositoryId });
    } catch (error) {
      this.logger.warn(
        `repository_deleted_broadcast_failed repo=${repositoryId} reason=${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
    }
  }

  private isHookAlreadyExistsError(error: unknown): boolean {
    const response = (error as { response?: { status?: number; data?: unknown } })?.response;
    if (response?.status !== 422) {
      return false;
    }
    const data = response.data as { errors?: Array<{ message?: string }> } | undefined;
    return Boolean(data?.errors?.some((entry) => entry.message?.toLowerCase().includes('already exists')));
  }

  /**
   * 自愈：GitHub 上已有相同 URL 的 webhook，删除旧的再用我们当前 DB 的 secret 重建
   * 必须重建：旧 webhook 的 secret 跟我们存的不一致，验签会失败
   */
  private async healExistingWebhook(params: {
    owner: string;
    repo: string;
    webhookUrl: string;
    webhookSecret: string;
    userOAuthToken?: string;
    repositoryId: string;
    repositoryFullName: string;
  }): Promise<WebhookProvisionResult | null> {
    try {
      const existing = await this.githubService.listWebhooks(
        params.owner,
        params.repo,
        params.userOAuthToken,
      );
      const stale = existing.find((hook) => hook.config?.url === params.webhookUrl);
      if (!stale) {
        this.logger.warn(
          `webhook_self_heal_no_match repo=${params.repositoryFullName} url=${params.webhookUrl}`,
        );
        return null;
      }

      await this.githubService.deleteWebhook(
        params.owner,
        params.repo,
        String(stale.id),
        params.userOAuthToken,
      );

      const newId = await this.githubService.createWebhook(
        params.owner,
        params.repo,
        params.webhookUrl,
        params.webhookSecret,
        params.userOAuthToken,
      );
      const newIdStr = String(newId);

      await this.persistWebhookState(params.repositoryId, {
        webhookId: newIdStr,
        webhookStatus: WebhookStatus.ACTIVE,
        webhookError: null,
      });
      await this.pruneStaleGithubWebhooks({
        owner: params.owner,
        repo: params.repo,
        keepWebhookId: newIdStr,
        userOAuthToken: params.userOAuthToken,
        repositoryFullName: params.repositoryFullName,
      });

      this.logger.log(
        `webhook_self_heal_success repo=${params.repositoryFullName} oldId=${stale.id} newId=${newIdStr}`,
      );
      return { webhookStatus: WebhookStatus.ACTIVE, webhookId: newIdStr };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(
        `webhook_self_heal_failed repo=${params.repositoryFullName} message=${message}`,
      );
      return null;
    }
  }

  /**
   * 清理孤儿 webhook：隧道 URL 每次启动随机，旧 URL 的 hook 既不会被 create 命中（URL 不同，
   * GitHub 不报 "already exists"），也不会被 retryWebhook 删除（DB 只存最新一个 id，旧 id 已丢失），
   * 于是越积越多、全部指向已死的隧道地址（GitHub 投递恒 502 failed to connect to host）。
   * 这里在 provision 成功后，把本 app 注册的（config.url 以 /webhooks/github 结尾）、
   * 但不是当前要保留的那个 hook 全部删掉。非致命：清理失败仅告警，不影响主流程。
   */
  private async pruneStaleGithubWebhooks(params: {
    owner: string;
    repo: string;
    keepWebhookId: string;
    userOAuthToken?: string;
    repositoryFullName: string;
  }): Promise<void> {
    try {
      const hooks = await this.githubService.listWebhooks(
        params.owner,
        params.repo,
        params.userOAuthToken,
      );
      const stale = hooks.filter(
        (hook) =>
          String(hook.id) !== params.keepWebhookId &&
          (hook.config?.url ?? '').endsWith('/webhooks/github'),
      );
      if (stale.length === 0) {
        return;
      }
      for (const hook of stale) {
        // deleteWebhook 内部已吞掉单次删除错误（仅记日志），不会中断循环
        await this.githubService.deleteWebhook(
          params.owner,
          params.repo,
          String(hook.id),
          params.userOAuthToken,
        );
      }
      this.logger.log(
        `webhook_prune_stale repo=${params.repositoryFullName} kept=${params.keepWebhookId} pruned=${stale.length}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(
        `webhook_prune_stale_failed repo=${params.repositoryFullName} message=${message}`,
      );
    }
  }

  private classifyWebhookError(error: unknown, repositoryFullName: string): WebhookProvisionResult {
    const response = (error as { response?: { status?: number; data?: unknown } })?.response;
    const status = response?.status;
    const data = response?.data as
      | { message?: string; errors?: Array<{ message?: string; resource?: string; code?: string }> }
      | undefined;
    const rawMessage = error instanceof Error ? error.message : String(error);
    const baseMessage = data?.message ?? rawMessage;
    const errorsDetail = data?.errors
      ?.map((entry) => entry.message || entry.code)
      .filter((entry): entry is string => Boolean(entry))
      .join('; ');
    const detailMessage = errorsDetail ? `${baseMessage}: ${errorsDetail}` : baseMessage;

    this.logger.error(
      `webhook_provision_failed repo=${repositoryFullName} status=${status ?? 'unknown'} message=${detailMessage}`,
    );

    if (status === 401 || status === 403) {
      return { webhookStatus: WebhookStatus.INSUFFICIENT_SCOPE, webhookError: detailMessage };
    }
    if (status === 404) {
      return { webhookStatus: WebhookStatus.NOT_FOUND, webhookError: detailMessage };
    }
    return { webhookStatus: WebhookStatus.FAILED, webhookError: detailMessage };
  }

  async findAll(userId: string, options?: { isActive?: boolean }) {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    const where: Record<string, unknown> = {};

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        users: {
          some: { userId },
        },
        ...where,
      },
      include: {
        users: {
          where: { userId },
          select: {
            userId: true,
            role: true,
            accessMode: true,
            accessLevel: true,
          },
        },
        _count: {
          select: { events: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return repositories.map(({ users, ...repository }) =>
      this.attachRepositoryAccessView(
        repository,
        users[0],
        this.isRepositoryInMonitoringScope(monitoredRepositoryIds, repository.id),
      ),
    );
  }

  async findById(userId: string, id: string): Promise<Repository & Record<string, unknown>> {
    const [membership, monitoredRepositoryIds] = await Promise.all([
      assertUserCanAccessRepository(userId, id),
      getUserMonitoredRepositoryIds(userId),
    ]);
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        events: {
          take: 10,
          orderBy: { occurredAt: 'desc' },
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
      throw new NotFoundException('Repository not found');
    }

    return this.attachRepositoryAccessView(
      repository as Repository & Record<string, unknown>,
      membership,
      this.isRepositoryInMonitoringScope(monitoredRepositoryIds, id),
    );
  }

  async getBranches(userId: string, id: string): Promise<RepositoryBranchOption[]> {
    await assertUserCanAccessRepository(userId, id);

    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                githubAccessToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    const tokenOwner = repository.users.find((entry) => entry.user.githubAccessToken);

    let providerBranches: Array<GithubBranchInfo | GitlabBranchInfo> = [];
    try {
      if (repository.platform === Platform.GITHUB) {
        providerBranches = await this.githubService.getBranches(
          owner,
          repo,
          tokenOwner?.user.githubAccessToken || undefined,
        );
      } else {
        providerBranches = await this.gitlabService.getBranches(owner, repo);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch provider branches for ${repository.fullName}, falling back to observed branches`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    const observedEvents = await this.prisma.event.findMany({
      where: { repositoryId: id },
      select: {
        branch: true,
        sourceBranch: true,
        targetBranch: true,
        branches: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const observedBranches = observedEvents.flatMap((event) =>
      [...event.branches, event.branch, event.sourceBranch, event.targetBranch].filter(
        (branch): branch is string => Boolean(branch),
      ),
    );

    const branchMap = new Map<string, RepositoryBranchOption>();
    const ensureBranch = (name: string) => {
      const existing = branchMap.get(name);
      if (existing) {
        return existing;
      }

      const next: RepositoryBranchOption = {
        name,
        isDefault: name === repository.defaultBranch,
        isObserved: false,
      };
      branchMap.set(name, next);
      return next;
    };

    for (const branch of providerBranches) {
      const option = ensureBranch(branch.name);
      option.isProtected = branch.isProtected;
      option.lastCommitSha = branch.lastCommitSha;
    }

    ensureBranch(repository.defaultBranch);

    for (const branch of observedBranches) {
      ensureBranch(branch).isObserved = true;
    }

    return Array.from(branchMap.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async update(id: string, dto: UpdateRepositoryDto) {
    return this.prisma.repository.update({
      where: { id },
      data: dto,
    });
  }

  async updateForUser(userId: string, id: string, dto: UpdateRepositoryDto) {
    await assertUserCanEditRepository(userId, id);
    const updated = await this.prisma.repository.update({
      where: { id },
      data: dto,
    });
    this.emitRepositoryUpdated(userId, id);
    return updated;
  }

  async delete(userId: string, id: string) {
    const membership = await assertUserCanAccessRepository(userId, id);

    if (isEditableRepositoryAccessLevel(membership.accessLevel)) {
      const repository = await this.prisma.repository.findUnique({
        where: { id },
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  githubAccessToken: true,
                },
              },
            },
          },
        },
      });

      if (!repository) {
        throw new NotFoundException('Repository not found');
      }

      const [owner, repo] = this.parseRepositoryPath(repository.fullName);
      const tokenOwner = repository.users.find((entry) => entry.user.githubAccessToken);

      if (repository.webhookId) {
        try {
          if (repository.platform === Platform.GITHUB) {
            await this.githubService.deleteWebhook(
              owner,
              repo,
              repository.webhookId,
              tokenOwner?.user.githubAccessToken || undefined,
            );
          } else {
            await this.gitlabService.deleteWebhook(owner, repo, Number(repository.webhookId));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown_error';
          this.logger.warn(
            `Failed to clean up webhook for repository ${repository.fullName}: ${message}`,
          );
        }
      }

      await this.prisma.repository.delete({
        where: { id },
      });

      this.logger.log(`Repository ${repository.fullName} deleted globally by user ${userId}`);
    } else {
      await this.prisma.userRepository.delete({
        where: {
          userId_repositoryId: {
            userId,
            repositoryId: id,
          },
        },
      });
      this.logger.log(`Repository membership for ${id} deleted for user ${userId}`);
    }

    this.emitRepositoryDeleted(userId, id);
    return { success: true };
  }

  /**
   * 查询 webhook 的当前状态（用户访问详情页时调用）
   * - 若 webhookId 为空 → NOT_CONFIGURED
   * - 若 GitHub 仍返回 hook 且 active → ACTIVE
   * - 若 GitHub 404 → NOT_FOUND（被用户在 GitHub 上手动删了）
   * - 若 401/403 → INSUFFICIENT_SCOPE
   */
  async getWebhookStatus(userId: string, repositoryId: string) {
    const { repository, owner, repo, accessToken } = await this.loadRepositoryForWebhookOps(
      userId,
      repositoryId,
    );

    const apiUrl = (await this.appConfigService.get('API_URL', API_URL_FALLBACK)) ?? API_URL_FALLBACK;
    const webhookEndpoint = repository.platform === Platform.GITHUB ? 'github' : 'gitlab';
    const webhookUrl = `${apiUrl}/webhooks/${webhookEndpoint}`;

    if (!repository.webhookId) {
      const persistedStatus = (repository.webhookStatus as WebhookStatus | null) ?? null;
      return {
        repositoryId: repository.id,
        url: webhookUrl,
        secret: repository.webhookSecret,
        webhookId: null,
        status: persistedStatus ?? WebhookStatus.NOT_CONFIGURED,
        lastError: repository.webhookError ?? null,
        active: false,
        lastResponse: null,
      };
    }

    if (repository.platform !== Platform.GITHUB) {
      return {
        repositoryId: repository.id,
        url: webhookUrl,
        secret: repository.webhookSecret,
        webhookId: repository.webhookId,
        status: WebhookStatus.ACTIVE,
        lastError: null,
        active: true,
        lastResponse: null,
      };
    }

    try {
      const detail = await this.githubService.getWebhook(
        owner,
        repo,
        repository.webhookId,
        accessToken,
      );
      const delivery = resolveGithubWebhookDeliveryStatus(detail.active, detail.last_response);
      return {
        repositoryId: repository.id,
        url: webhookUrl,
        secret: repository.webhookSecret,
        webhookId: repository.webhookId,
        status: delivery.status,
        lastError: delivery.lastError,
        active: detail.active,
        lastResponse: detail.last_response ?? null,
      };
    } catch (error) {
      const classified = this.classifyWebhookError(error, repository.fullName);
      return {
        repositoryId: repository.id,
        url: webhookUrl,
        secret: repository.webhookSecret,
        webhookId: repository.webhookId,
        status: classified.webhookStatus,
        lastError: classified.webhookError ?? null,
        active: false,
        lastResponse: null,
      };
    }
  }

  /**
   * 重新创建 webhook（在 GitHub 上删除旧的再建新的，或仅在没有 webhookId 时创建）
   */
  async retryWebhook(userId: string, repositoryId: string): Promise<WebhookProvisionResult> {
    const { repository, owner, repo, accessToken } = await this.loadRepositoryForWebhookOps(
      userId,
      repositoryId,
    );

    if (repository.platform === Platform.GITHUB && repository.webhookId) {
      let deleted = false;
      try {
        await this.githubService.deleteWebhook(owner, repo, repository.webhookId, accessToken);
        deleted = true;
      } catch (error) {
        // GitHub 已返回 404（hook 不存在）也视为「已清理」，避免把已消失的 id 永久保留
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          deleted = true;
        }
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(
          `webhook_retry_cleanup_failed repo=${repository.fullName} status=${status ?? 'unknown'} message=${message}`,
        );
      }
      // 防御孤儿：仅在删除确实成功（或 hook 已不存在）时才清空 DB webhookId。
      // 若 delete 因瞬时错误失败仍清空 id，则旧 hook 会在 GitHub 上残留且再也无法被定位删除
      // （隧道 URL 每次启动唯一，provisionWebhook 的自愈仅按当前 URL 匹配，命中不了旧 URL 的孤儿）。
      // 保留 id 可让下一次 retry 用同一 id 再次（幂等）尝试删除。
      if (deleted) {
        await this.prisma.repository.update({
          where: { id: repository.id },
          data: { webhookId: null },
        });
      }
    }

    let webhookSecret = repository.webhookSecret;
    if (!webhookSecret) {
      webhookSecret = this.generateWebhookSecret();
      await this.prisma.repository.update({
        where: { id: repository.id },
        data: { webhookSecret },
      });
    }

    const provisioned = await this.provisionWebhook({
      platform: repository.platform,
      owner,
      repo,
      repositoryId: repository.id,
      repositoryFullName: repository.fullName,
      webhookSecret,
      userOAuthToken: accessToken,
    });
    this.emitRepositoryUpdated(userId, repository.id);
    return provisioned;
  }

  /**
   * 让 GitHub 重发 ping 事件，用于端到端验证 webhook 链路
   */
  async testWebhook(userId: string, repositoryId: string) {
    const { repository, owner, repo, accessToken } = await this.loadRepositoryForWebhookOps(
      userId,
      repositoryId,
    );

    if (repository.platform !== Platform.GITHUB) {
      throw new ForbiddenException('Test ping only supported for GitHub webhooks');
    }
    if (!repository.webhookId) {
      throw new NotFoundException('Webhook not configured for this repository');
    }

    await this.githubService.pingWebhook(owner, repo, repository.webhookId, accessToken);
    return { success: true };
  }

  /**
   * 合并 Pull Request
   * 需要 write 权限（accessMode=EDITABLE）
   */
  async mergePullRequest(userId: string, repositoryId: string, pullNumber: number) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        users: {
          include: {
            user: {
              select: { id: true, githubAccessToken: true },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    const membership = repository.users.find((entry) => entry.userId === userId);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this repository');
    }

    if (membership.accessMode !== RepositoryAccessMode.EDITABLE) {
      throw new ForbiddenException('Editable access required to merge pull requests');
    }

    if (repository.platform !== Platform.GITHUB) {
      throw new ForbiddenException('PR merge only supported for GitHub repositories');
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    const callerToken = membership.user.githubAccessToken;
    const fallbackToken = repository.users.find((entry) => entry.user.githubAccessToken)?.user
      .githubAccessToken;
    const accessToken = callerToken ?? fallbackToken;

    if (!accessToken) {
      throw new ForbiddenException('GitHub account not connected');
    }

    return this.githubService.mergePullRequest(owner, repo, pullNumber, accessToken);
  }

  /**
   * 批量重建用户可编辑（accessMode=EDITABLE）的所有 active 仓库 webhook
   * 用于 API_URL 变更后批量同步到 GitHub（复用 retryWebhook 内部的自愈机制）
   */
  async batchRetryWebhooks(userId: string): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    failures: Array<{ repositoryId: string; fullName: string; status: WebhookStatus; error?: string }>;
  }> {
    const repos = await this.prisma.repository.findMany({
      where: {
        isActive: true,
        // 用 accessMode===EDITABLE 而非 role==='ADMIN':仓库 role 常为 MEMBER（默认值，多路径写入不一致），
        // 永远过不了 role==='ADMIN' → 批量匹配 0 个仓库。accessMode 在 DB 中始终正确维护
        // （可编辑=EDITABLE），与单仓 loadRepositoryForWebhookOps 的门禁口径一致。
        users: { some: { userId, accessMode: RepositoryAccessMode.EDITABLE } },
      },
      select: { id: true, fullName: true },
    });

    // 受限并发：每个 retryWebhook 内部对 GitHub 发起多次 API 调用（delete + list + create），
    // 全量并发（如 70+ 仓库）极易触发 GitHub secondary rate limit / abuse detection。
    // 此处把并发收敛为分块串行（块内并发 BATCH_RETRY_CONCURRENCY，块间延迟 BATCH_RETRY_DELAY_MS），
    // 不引入第三方依赖（如 p-limit），返回结构与对外行为保持不变。
    const BATCH_RETRY_CONCURRENCY = 4;
    const BATCH_RETRY_DELAY_MS = 300;

    const results: Array<
      PromiseSettledResult<{ repo: (typeof repos)[number]; result: WebhookProvisionResult }>
    > = [];

    for (let offset = 0; offset < repos.length; offset += BATCH_RETRY_CONCURRENCY) {
      const chunk = repos.slice(offset, offset + BATCH_RETRY_CONCURRENCY);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (repo) => ({
          repo,
          result: await this.retryWebhook(userId, repo.id),
        })),
      );
      results.push(...chunkResults);

      // 块间小延迟，进一步降速以规避 GitHub abuse detection（最后一块不再等待）
      if (offset + BATCH_RETRY_CONCURRENCY < repos.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_RETRY_DELAY_MS));
      }
    }

    let succeeded = 0;
    const failures: Array<{ repositoryId: string; fullName: string; status: WebhookStatus; error?: string }> = [];

    for (const settled of results) {
      if (settled.status === 'fulfilled') {
        const { repo, result } = settled.value;
        if (result.webhookStatus === WebhookStatus.ACTIVE) {
          succeeded += 1;
        } else {
          failures.push({
            repositoryId: repo.id,
            fullName: repo.fullName,
            status: result.webhookStatus,
            error: result.webhookError,
          });
        }
      } else {
        const reason = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
        failures.push({
          repositoryId: 'unknown',
          fullName: 'unknown',
          status: WebhookStatus.FAILED,
          error: reason,
        });
      }
    }

    this.logger.log(
      `batch_retry_webhooks_completed userId=${userId} total=${repos.length} succeeded=${succeeded} failed=${failures.length}`,
    );

    return {
      total: repos.length,
      succeeded,
      failed: failures.length,
      failures,
    };
  }

  /**
   * 加载仓库 + 权限校验（必须可编辑）+ 解析 owner/repo + 找到一个可用的 githubAccessToken
   */
  private async loadRepositoryForWebhookOps(userId: string, repositoryId: string) {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId },
      include: {
        users: {
          include: {
            user: {
              select: { id: true, githubAccessToken: true },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    const membership = repository.users.find((entry) => entry.userId === userId);
    if (!membership) {
      throw new ForbiddenException('You do not have access to this repository');
    }
    // 用可靠的 accessMode 判定能否管理 webhook，而非脆弱的 legacy role：
    // role 列默认值为 MEMBER，且 sync / upsert 等多处写入不一致，导致同步发现的
    // 仓库 role 常为 MEMBER，永远过不了 role==='ADMIN' 门禁。accessMode 在 DB 中
    // 始终正确维护（可编辑=EDITABLE，只读=MONITOR）。
    if (membership.accessMode !== RepositoryAccessMode.EDITABLE) {
      throw new ForbiddenException('Editable access required to manage webhooks');
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    const callerToken = membership.user.githubAccessToken;
    const fallbackToken = repository.users.find((entry) => entry.user.githubAccessToken)?.user
      .githubAccessToken;
    const accessToken = callerToken ?? fallbackToken ?? undefined;

    return { repository, owner, repo, accessToken: accessToken ?? undefined };
  }

  async sync(
    id: string,
    options?: {
      daysBack?: number;
      onStageStart?: (stage: 'commits' | 'prs' | 'releases' | 'issues') => Promise<void> | void;
      eventPostCreate?: EventPostCreateOptions;
    },
  ): Promise<SyncSummary> {
    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: {
              select: {
                githubAccessToken: true,
                githubRefreshToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }
    const [owner, repo] = this.parseRepositoryPath(repository.fullName);
    const daysBack = options?.daysBack ?? 7;
    const sinceDate =
      repository.lastSyncAt ?? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const since = sinceDate.toISOString();
    const releaseSinceDate = new Date(
      Date.now() - Math.max(daysBack, RELEASE_SYNC_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000,
    );
    const releaseSince = releaseSinceDate.toISOString();
    const failedSources: string[] = [];
    let createdCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let successfulSources = 0;

    const accumulate = (summary: {
      createdCount: number;
      skippedCount: number;
      updatedCount: number;
      successfulSources: number;
    }) => {
      createdCount += summary.createdCount;
      skippedCount += summary.skippedCount;
      updatedCount += summary.updatedCount;
      successfulSources += summary.successfulSources;
    };

    if (repository.platform === Platform.GITHUB) {
      const tokenOwner = repository.users.find((entry) => entry.user.githubAccessToken);
      if (!tokenOwner?.user.githubAccessToken) {
        failedSources.push('github_token_missing');
      } else {
        const branches = await this.githubService.getBranches(
          owner,
          repo,
          tokenOwner.user.githubAccessToken || undefined,
        );
        const branchNames = branches.length > 0
          ? branches.map((branch) => branch.name)
          : [repository.defaultBranch];

        await options?.onStageStart?.('commits');
        const commitSources = branchNames.map(
          (branchName) => ({
            name: `github_commits:${branchName}`,
            fetch: () =>
              this.githubService.getCommits(
                owner,
                repo,
                { branch: branchName, since },
                tokenOwner.user.githubAccessToken || undefined,
              ),
            normalize: (item: unknown) => this.normalizeGithubCommit(item, branchName),
          }),
        );
        accumulate(
          await this.syncSources(
            repository.id,
            commitSources,
            failedSources,
            options?.eventPostCreate,
          ),
        );

        await options?.onStageStart?.('prs');
        accumulate(
          await this.syncSources(
            repository.id,
            [
              {
                name: 'github_pull_requests',
                fetch: () =>
                  this.githubService.getPullRequests(
                    owner,
                    repo,
                    'all',
                    tokenOwner.user.githubAccessToken || undefined,
                  ),
                normalize: (item: unknown) => this.normalizeGithubPullRequest(item, sinceDate),
              },
            ],
            failedSources,
            options?.eventPostCreate,
          ),
        );

        await options?.onStageStart?.('releases');
        accumulate(
          await this.syncSources(
            repository.id,
            [
              {
                name: 'github_releases',
                fetch: () =>
                  this.githubService.getReleases(
                    owner,
                    repo,
                    { since: releaseSince },
                    tokenOwner.user.githubAccessToken || undefined,
                  ),
                normalize: (item: unknown) => this.normalizeGithubRelease(item, releaseSinceDate),
              },
            ],
            failedSources,
            options?.eventPostCreate,
          ),
        );

        await options?.onStageStart?.('issues');
        accumulate(
          await this.syncSources(
            repository.id,
            [
              {
                name: 'github_issues',
                fetch: () =>
                  this.githubService.getIssues(
                    owner,
                    repo,
                    'all',
                    tokenOwner.user.githubAccessToken || undefined,
                  ),
                normalize: (item: unknown) => this.normalizeGithubIssue(item, sinceDate),
              },
            ],
            failedSources,
            options?.eventPostCreate,
          ),
        );
      }
    } else {
      const branches = await this.gitlabService.getBranches(owner, repo);
      const branchNames = branches.length > 0
        ? branches.map((branch) => branch.name)
        : [repository.defaultBranch];

      await options?.onStageStart?.('commits');
      const commitSources = branchNames.map(
        (branchName) => ({
          name: `gitlab_commits:${branchName}`,
          fetch: () =>
            this.gitlabService.getCommits(owner, repo, {
              branch: branchName,
              since,
            }),
          normalize: (item: unknown) => this.normalizeGitlabCommit(item, branchName),
        }),
      );
      accumulate(
        await this.syncSources(
          repository.id,
          commitSources,
          failedSources,
          options?.eventPostCreate,
        ),
      );

      await options?.onStageStart?.('prs');
      accumulate(
        await this.syncSources(
          repository.id,
          [
            {
              name: 'gitlab_merge_requests',
              fetch: () => this.gitlabService.getMergeRequests(owner, repo, 'all'),
              normalize: (item: unknown) => this.normalizeGitlabMergeRequest(item, sinceDate),
            },
          ],
          failedSources,
          options?.eventPostCreate,
        ),
      );

      await options?.onStageStart?.('releases');
      accumulate(
        await this.syncSources(
          repository.id,
          [
            {
              name: 'gitlab_releases',
              fetch: () => this.gitlabService.getReleases(owner, repo, { since: releaseSince }),
              normalize: (item: unknown) => this.normalizeGitlabRelease(item, releaseSinceDate),
            },
          ],
          failedSources,
          options?.eventPostCreate,
        ),
      );

      await options?.onStageStart?.('issues');
      accumulate(
        await this.syncSources(
          repository.id,
          [
            {
              name: 'gitlab_issues',
              fetch: () => this.gitlabService.getIssues(owner, repo, 'all'),
              normalize: (item: unknown) => this.normalizeGitlabIssue(item, sinceDate),
            },
          ],
          failedSources,
          options?.eventPostCreate,
        ),
      );
    }

    const completedAt =
      successfulSources > 0 ? new Date() : repository.lastSyncAt || new Date(sinceDate);
    if (successfulSources > 0) {
      await this.prisma.repository.update({
        where: { id },
        data: { lastSyncAt: completedAt },
      });
    }

    this.logger.log(
      `repository_sync_completed repositoryId=${id} createdCount=${createdCount} updatedCount=${updatedCount} skippedCount=${skippedCount} failedSources=${failedSources.join(',') || 'none'}`,
    );

    return {
      repositoryId: id,
      createdCount,
      skippedCount,
      updatedCount,
      failedSources,
      lastSyncAt: completedAt.toISOString(),
    };
  }

  /**
   * 重新注册 Webhook
   */
  async registerWebhook(userId: string, id: string) {
    await assertUserCanEditRepository(userId, id);

    const repository = await this.prisma.repository.findUnique({
      where: { id },
      include: {
        users: {
          where: { userId },
          include: {
            user: {
              select: {
                githubAccessToken: true,
              },
            },
          },
        },
      },
    });

    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    if (repository.platform !== Platform.GITHUB) {
      throw new BadRequestException(
        'Webhook re-registration currently supports GitHub repositories only',
      );
    }

    const userOAuthToken = repository.users[0]?.user.githubAccessToken;
    if (!userOAuthToken) {
      throw new BadRequestException('GitHub account is not connected');
    }

    const [owner, repo] = this.parseRepositoryPath(repository.fullName);

    // 生成新的 webhook secret
    const webhookSecret = this.generateWebhookSecret();

    const apiUrl = this.configService.get<string>('API_URL', 'http://localhost:3001');
    const webhookUrl = `${apiUrl}/webhooks/github`;

    // 创建 Webhook
    const webhookId = await this.githubService.createWebhook(
      owner,
      repo,
      webhookUrl,
      webhookSecret,
      userOAuthToken,
    );

    // 更新仓库记录
    await this.prisma.repository.update({
      where: { id },
      data: {
        webhookId: webhookId ? String(webhookId) : null,
        webhookSecret,
      },
    });

    this.logger.log(
      `Webhook re-registered for ${repository.fullName} by user ${userId}`,
    );
    return { success: true, webhookId };
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

  async searchUserRepositories(
    userId: string,
    userOAuthToken: string,
    userRefreshToken?: string,
    githubLogin?: string | null,
  ) {
    if (!userOAuthToken) {
      this.logger.warn('No user OAuth token available for repository lookup');
      return [];
    }

    const monitoredExternalIds = await this.getMonitoredGithubExternalIds(userId);
    const defaultMonitorAllRepositories = monitoredExternalIds === null;
    const repos = await this.githubService.getUserRepositories(
      userOAuthToken,
      userRefreshToken,
    );
    return repos.map((repo) => {
      const accessLevel = this.resolveGithubAccessLevel(repo, githubLogin);
      const isEditable = isEditableRepositoryAccessLevel(accessLevel);
      return {
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
        accessLevel: this.mapAccessLevelToApi(accessLevel),
        canOperate: isEditable,
        isEditable,
        isMonitored: defaultMonitorAllRepositories || monitoredExternalIds.has(String(repo.id)),
      };
    });
  }

  async searchStarredRepositories(
    userId: string,
    userOAuthToken: string,
    userRefreshToken?: string,
  ) {
    if (!userOAuthToken) {
      this.logger.warn('No user OAuth token available for starred repository lookup');
      return [];
    }

    const monitoredExternalIds = await this.getMonitoredGithubExternalIds(userId);
    const defaultMonitorAllRepositories = monitoredExternalIds === null;
    const repos = await this.githubService.getStarredRepos(
      userOAuthToken,
      userRefreshToken,
    );
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
      accessLevel: this.mapAccessLevelToApi(RepositoryAccessLevel.READ),
      canOperate: false,
      isEditable: false,
      isMonitored: defaultMonitorAllRepositories || monitoredExternalIds.has(String(repo.id)),
    }));
  }

  private async getMonitoredGithubExternalIds(userId: string): Promise<Set<string> | null> {
    const monitoredRepositoryIds = await getUserMonitoredRepositoryIds(userId);
    if (monitoredRepositoryIds.length === 0) {
      return null;
    }

    const repositories = await this.prisma.repository.findMany({
      where: {
        id: { in: monitoredRepositoryIds },
        platform: Platform.GITHUB,
      },
      select: { externalId: true },
    });

    return new Set(repositories.map((repository) => repository.externalId));
  }

  private isRepositoryInMonitoringScope(monitoredRepositoryIds: string[], repositoryId: string): boolean {
    return monitoredRepositoryIds.length === 0 || monitoredRepositoryIds.includes(repositoryId);
  }

  async syncForUser(
    userId: string,
    id: string,
    options?: { daysBack?: number },
  ): Promise<SyncSummary> {
    await assertUserCanAccessRepository(userId, id);
    return this.sync(id, options);
  }

  private async syncSources(
    repositoryId: string,
    sources: Array<{
      name: string;
      fetch: () => Promise<unknown[]>;
      normalize: (item: unknown) => NormalizedSyncEvent | null;
    }>,
    failedSources: string[],
    eventPostCreate?: EventPostCreateOptions,
  ): Promise<{
    createdCount: number;
    skippedCount: number;
    updatedCount: number;
    successfulSources: number;
  }> {
    let createdCount = 0;
    let skippedCount = 0;
    let updatedCount = 0;
    let successfulSources = 0;

    for (const source of sources) {
      try {
        const items = await source.fetch();
        successfulSources += 1;
        for (const item of items) {
          const normalized = source.normalize(item);
          if (!normalized) {
            skippedCount += 1;
            continue;
          }

          const existing = await this.eventService.findByExternalId(
            repositoryId,
            normalized.externalId,
          );
          if (existing) {
            const branches = this.resolveBranches(normalized.branches, [
              normalized.branch,
              normalized.sourceBranch,
              normalized.targetBranch,
            ]);
            const existingBranches = existing.branches ?? [];
            const mergedBranches = this.mergeBranches(existingBranches, branches);
            if (mergedBranches.length > existingBranches.length) {
              await this.prisma.event.update({
                where: { id: existing.id },
                data: { branches: mergedBranches },
              });
              updatedCount += 1;
            } else {
              skippedCount += 1;
            }
            continue;
          }

          const branches = this.resolveBranches(normalized.branches, [
            normalized.branch,
            normalized.sourceBranch,
            normalized.targetBranch,
          ]);

          const eventData = {
            repositoryId,
            type: normalized.type,
            action: normalized.action,
            title: normalized.title,
            body: normalized.body,
            author: normalized.author,
            authorAvatar: normalized.authorAvatar,
            externalId: normalized.externalId,
            externalUrl: normalized.externalUrl,
            branch: normalized.branch,
            sourceBranch: normalized.sourceBranch,
            targetBranch: normalized.targetBranch,
            branches,
            occurredAt: normalized.occurredAt,
            metadata: normalized.metadata,
          };
          if (eventPostCreate) {
            await this.eventService.create(eventData, eventPostCreate);
          } else {
            await this.eventService.create(eventData);
          }
          createdCount += 1;
        }
      } catch (error) {
        failedSources.push(source.name);
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.error(
          `Failed to sync source ${source.name} for repository ${repositoryId}: ${message}`,
        );
      }
    }

    return { createdCount, skippedCount, updatedCount, successfulSources };
  }

  private resolveBranches(
    explicitBranches: string[] | undefined,
    fallbackBranches: Array<string | undefined>,
  ): string[] {
    const rawBranches = explicitBranches && explicitBranches.length > 0
      ? explicitBranches
      : fallbackBranches;

    return Array.from(
      new Set(
        rawBranches
          .filter((branch): branch is string => typeof branch === 'string')
          .map((branch) => branch.trim())
          .filter(Boolean),
      ),
    );
  }

  private mergeBranches(existingBranches: string[], incomingBranches: string[]): string[] {
    return this.resolveBranches([...existingBranches, ...incomingBranches], []);
  }

  private resolveGithubAccessLevel(
    repo: GithubRepoResponse,
    githubLogin?: string | null,
  ): RepositoryAccessLevel {
    if (githubLogin && repo.owner?.login?.toLowerCase() === githubLogin.toLowerCase()) {
      return RepositoryAccessLevel.OWNER;
    }

    const permissions = repo.permissions;
    if (permissions?.admin) {
      return RepositoryAccessLevel.ADMIN;
    }
    if (permissions?.maintain) {
      return RepositoryAccessLevel.MAINTAIN;
    }
    if (permissions?.push) {
      return RepositoryAccessLevel.WRITE;
    }
    if (permissions?.triage) {
      return RepositoryAccessLevel.TRIAGE;
    }
    if (permissions?.pull) {
      return RepositoryAccessLevel.READ;
    }

    return RepositoryAccessLevel.NONE;
  }

  private resolveAccessModeFromLevel(accessLevel: RepositoryAccessLevel): RepositoryAccessMode {
    return isEditableRepositoryAccessLevel(accessLevel)
      ? RepositoryAccessMode.EDITABLE
      : RepositoryAccessMode.MONITOR;
  }

  private mapAccessLevelToApi(accessLevel: RepositoryAccessLevel): RepositoryAccessLevelApi {
    switch (accessLevel) {
      case RepositoryAccessLevel.OWNER:
        return 'owner';
      case RepositoryAccessLevel.ADMIN:
        return 'admin';
      case RepositoryAccessLevel.MAINTAIN:
        return 'maintain';
      case RepositoryAccessLevel.WRITE:
        return 'write';
      case RepositoryAccessLevel.TRIAGE:
        return 'triage';
      case RepositoryAccessLevel.READ:
        return 'read';
      default:
        return 'none';
    }
  }

  private attachRepositoryAccessView<T extends Record<string, unknown>>(
    repository: T,
    membership?: RepositoryMembershipView | null,
    isMonitored = false,
  ): T & {
    accessLevel: RepositoryAccessLevelApi;
    canOperate: boolean;
    isMonitored: boolean;
    isEditable: boolean;
  } {
    const accessLevel = membership?.accessLevel ?? RepositoryAccessLevel.NONE;
    const isEditable = isEditableRepositoryAccessLevel(accessLevel);

    return {
      ...repository,
      accessLevel: this.mapAccessLevelToApi(accessLevel),
      canOperate: isEditable,
      isMonitored,
      isEditable,
    };
  }

  private parseRepositoryPath(fullName: string): [string, string] {
    const separatorIndex = fullName.lastIndexOf('/');
    if (separatorIndex === -1) {
      return [fullName, fullName];
    }

    return [fullName.slice(0, separatorIndex), fullName.slice(separatorIndex + 1)];
  }

  private normalizeGithubCommit(item: unknown, branch: string): NormalizedSyncEvent | null {
    const commit = item as {
      sha?: string;
      html_url?: string;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string };
      };
      author?: { login?: string; avatar_url?: string };
    };

    if (!commit.sha) {
      return null;
    }

    return {
      type: EventType.PUSH,
      action: 'sync',
      title: `Push sync (${branch}): ${commit.sha.slice(0, 7)}`,
      body: commit.commit?.message,
      author: commit.commit?.author?.name || commit.author?.login || 'unknown',
      authorAvatar: commit.author?.avatar_url,
      externalId: commit.sha,
      externalUrl: commit.html_url,
      branch,
      branches: [branch],
      occurredAt: new Date(commit.commit?.author?.date || new Date()),
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        branch,
        githubLogin: commit.author?.login || null,
      },
    };
  }

  private normalizeGithubPullRequest(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const pr = item as {
      id?: number;
      title?: string;
      body?: string | null;
      html_url?: string;
      state?: string;
      merged_at?: string | null;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      head?: { ref?: string };
      base?: { ref?: string };
      user?: { login?: string; avatar_url?: string };
      number?: number;
    };

    if (!pr.id || !this.isRecentEnough(pr.updated_at ?? pr.created_at, sinceDate)) {
      return null;
    }

    const merged = Boolean(pr.merged_at);
    const type = merged
      ? EventType.PR_MERGED
      : pr.state === 'closed'
        ? EventType.PR_CLOSED
        : EventType.PR_OPENED;

    return {
      type,
      action: merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'opened',
      title: pr.title || 'Pull request sync',
      body: pr.body || undefined,
      author: pr.user?.login || 'unknown',
      authorAvatar: pr.user?.avatar_url,
      externalId: `gh-pr-${pr.id}`,
      externalUrl: pr.html_url,
      branch: pr.base?.ref,
      sourceBranch: pr.head?.ref,
      targetBranch: pr.base?.ref,
      branches: this.resolveBranches(undefined, [pr.head?.ref, pr.base?.ref]),
      occurredAt: new Date(
        merged
          ? pr.merged_at || pr.closed_at || pr.updated_at || pr.created_at || new Date().toISOString()
          : pr.state === 'closed'
            ? pr.closed_at || pr.updated_at || pr.created_at || new Date().toISOString()
            : pr.created_at || pr.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        prNumber: pr.number,
      },
    };
  }

  private normalizeGithubIssue(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const issue = item as {
      id?: number;
      title?: string;
      body?: string | null;
      html_url?: string;
      state?: string;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      number?: number;
      user?: { login?: string; avatar_url?: string };
      pull_request?: unknown;
    };

    if (
      issue.pull_request ||
      !issue.id ||
      !this.isRecentEnough(issue.updated_at ?? issue.created_at, sinceDate)
    ) {
      return null;
    }

    return {
      type: issue.state === 'closed' ? EventType.ISSUE_CLOSED : EventType.ISSUE_OPENED,
      action: issue.state === 'closed' ? 'closed' : 'opened',
      title: issue.title || 'Issue sync',
      body: issue.body || undefined,
      author: issue.user?.login || 'unknown',
      authorAvatar: issue.user?.avatar_url,
      externalId: `gh-issue-${issue.id}`,
      externalUrl: issue.html_url,
      branches: [],
      occurredAt: new Date(
        issue.state === 'closed'
          ? issue.closed_at || issue.updated_at || issue.created_at || new Date().toISOString()
          : issue.created_at || issue.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        issueNumber: issue.number,
      },
    };
  }

  private normalizeGithubRelease(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const release = item as GithubReleaseResponse;
    const occurredAtValue = release.published_at ?? release.created_at;
    const tagName = release.tag_name?.trim();

    if (
      release.draft ||
      (!release.id && !tagName) ||
      !this.isRecentEnough(occurredAtValue ?? undefined, sinceDate)
    ) {
      return null;
    }

    return {
      type: EventType.RELEASE,
      action: release.prerelease ? 'prereleased' : 'published',
      title: release.name?.trim() || (tagName ? `Release ${tagName}` : 'Release sync'),
      body: release.body || undefined,
      author: release.author?.login || 'unknown',
      authorAvatar: release.author?.avatar_url,
      externalId: release.id ? `gh-release-${release.id}` : `gh-release-tag-${tagName}`,
      externalUrl: release.html_url,
      branches: [],
      occurredAt: new Date(occurredAtValue || new Date().toISOString()),
      metadata: {
        source: 'repository_sync',
        provider: 'github',
        tagName,
        targetCommitish: release.target_commitish,
        prerelease: Boolean(release.prerelease),
      },
    };
  }

  private normalizeGitlabCommit(item: unknown, branch: string): NormalizedSyncEvent | null {
    const commit = item as {
      id?: string;
      message?: string;
      web_url?: string;
      author_name?: string;
      authored_date?: string;
      committed_date?: string;
      created_at?: string;
    };

    if (!commit.id) {
      return null;
    }

    return {
      type: EventType.PUSH,
      action: 'sync',
      title: `Push sync (${branch}): ${commit.id.slice(0, 7)}`,
      body: commit.message,
      author: commit.author_name || 'unknown',
      externalId: commit.id,
      externalUrl: commit.web_url,
      branch,
      branches: [branch],
      occurredAt: new Date(
        commit.authored_date || commit.committed_date || commit.created_at || new Date(),
      ),
      metadata: { source: 'repository_sync', provider: 'gitlab', branch },
    };
  }

  private normalizeGitlabMergeRequest(
    item: unknown,
    sinceDate: Date,
  ): NormalizedSyncEvent | null {
    const mr = item as {
      id?: number;
      title?: string;
      description?: string | null;
      web_url?: string;
      state?: string;
      merged_at?: string | null;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      source_branch?: string;
      target_branch?: string;
      author?: { username?: string; avatar_url?: string };
      iid?: number;
    };

    if (!mr.id || !this.isRecentEnough(mr.updated_at ?? mr.created_at, sinceDate)) {
      return null;
    }

    const merged = Boolean(mr.merged_at);
    const type = merged
      ? EventType.PR_MERGED
      : mr.state === 'closed'
        ? EventType.PR_CLOSED
        : EventType.PR_OPENED;

    return {
      type,
      action: merged ? 'merged' : mr.state === 'closed' ? 'closed' : 'opened',
      title: mr.title || 'Merge request sync',
      body: mr.description || undefined,
      author: mr.author?.username || 'unknown',
      authorAvatar: mr.author?.avatar_url,
      externalId: `gl-mr-${mr.id}`,
      externalUrl: mr.web_url,
      branch: mr.target_branch,
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      branches: this.resolveBranches(undefined, [mr.source_branch, mr.target_branch]),
      occurredAt: new Date(
        merged
          ? mr.merged_at || mr.closed_at || mr.updated_at || mr.created_at || new Date().toISOString()
          : mr.state === 'closed'
            ? mr.closed_at || mr.updated_at || mr.created_at || new Date().toISOString()
            : mr.created_at || mr.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'gitlab',
        mrIid: mr.iid,
      },
    };
  }

  private normalizeGitlabIssue(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const issue = item as {
      id?: number;
      title?: string;
      description?: string | null;
      web_url?: string;
      state?: string;
      closed_at?: string | null;
      updated_at?: string;
      created_at?: string;
      author?: { username?: string; avatar_url?: string };
      iid?: number;
    };

    if (!issue.id || !this.isRecentEnough(issue.updated_at ?? issue.created_at, sinceDate)) {
      return null;
    }

    return {
      type: issue.state === 'closed' ? EventType.ISSUE_CLOSED : EventType.ISSUE_OPENED,
      action: issue.state === 'closed' ? 'closed' : 'opened',
      title: issue.title || 'Issue sync',
      body: issue.description || undefined,
      author: issue.author?.username || 'unknown',
      authorAvatar: issue.author?.avatar_url,
      externalId: `gl-issue-${issue.id}`,
      externalUrl: issue.web_url,
      branches: [],
      occurredAt: new Date(
        issue.state === 'closed'
          ? issue.closed_at || issue.updated_at || issue.created_at || new Date().toISOString()
          : issue.created_at || issue.updated_at || new Date().toISOString(),
      ),
      metadata: {
        source: 'repository_sync',
        provider: 'gitlab',
        issueIid: issue.iid,
      },
    };
  }

  private normalizeGitlabRelease(item: unknown, sinceDate: Date): NormalizedSyncEvent | null {
    const release = item as GitlabReleaseResponse;
    const occurredAtValue = release.released_at ?? release.created_at;
    const tagName = release.tag_name?.trim();

    if (!tagName || !this.isRecentEnough(occurredAtValue ?? undefined, sinceDate)) {
      return null;
    }

    return {
      type: EventType.RELEASE,
      action: 'published',
      title: release.name?.trim() || `Release ${tagName}`,
      body: release.description || undefined,
      author: release.author?.username || 'unknown',
      authorAvatar: release.author?.avatar_url,
      externalId: `gl-release-${tagName}`,
      externalUrl: release._links?.self ?? release.tag_path,
      branches: [],
      occurredAt: new Date(occurredAtValue || new Date().toISOString()),
      metadata: {
        source: 'repository_sync',
        provider: 'gitlab',
        tagName,
      },
    };
  }

  private isRecentEnough(dateValue: string | undefined, sinceDate: Date): boolean {
    if (!dateValue) {
      return false;
    }

    return new Date(dateValue).getTime() >= sinceDate.getTime();
  }

  private generateWebhookSecret(): string {
    return randomBytes(32).toString('hex');
  }

  async getContributors(id: string, userOAuthToken?: string): Promise<any[]> {
    const cacheKey = `${id}:${userOAuthToken || 'default'}`;
    const cached = this.contributorsCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    const repository = await this.prisma.repository.findUnique({
      where: { id },
    });
    if (!repository) {
      throw new NotFoundException('Repository not found');
    }

    let contributors: any[] = [];
    const parts = repository.fullName.split('/');
    const owner = parts[0];
    const repo = parts[1];

    if (repository.platform === Platform.GITHUB) {
      const gitContributors = await this.githubService.getContributors(owner, repo, userOAuthToken);
      contributors = gitContributors.map(item => ({
        username: item.login,
        avatarUrl: item.avatar_url,
      }));
    } else if (repository.platform === Platform.GITLAB) {
      contributors = await this.gitlabService.getContributors(owner, repo);
    }

    this.contributorsCache.set(cacheKey, {
      data: contributors,
      expiry: Date.now() + 60 * 60 * 1000, // 1 hour TTL
    });

    return contributors;
  }
}
