import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaClient, Platform } from '@repo-pulse/database';

interface WebhookPayload {
  [key: string]: unknown;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private prisma: PrismaClient;

  constructor(
    @InjectQueue('webhook-events') private readonly webhookQueue: Queue,
  ) {
    this.prisma = new PrismaClient();
  }

  async handleGithubWebhook(
    signature: string | undefined,
    githubEvent: string | undefined,
    rawBody: Buffer | undefined,
    payload: WebhookPayload,
  ): Promise<void> {
    // 1. 从 Payload 提取仓库的 GitHub external ID
    const repoInfo = payload.repository as { id: number; full_name: string } | undefined;
    if (!repoInfo) {
      throw new BadRequestException('无效的 Payload：缺少 repository 字段');
    }

    // 2. 查询数据库获取该仓库的专属 webhookSecret
    const repository = await this.prisma.repository.findFirst({
      where: {
        platform: Platform.GITHUB,
        externalId: String(repoInfo.id),
      },
      select: {
        id: true,
        webhookSecret: true,
        fullName: true,
      },
    });

    if (!repository) {
      this.logger.warn(`Received webhook for unregistered repository: ${repoInfo.full_name}`);
      // 返回 200 避免 GitHub 重试，但不处理
      return;
    }

    // 3. 使用仓库专属 Secret 验签（基于 Raw Body）
    if (repository.webhookSecret && signature) {
      if (!rawBody) {
        throw new BadRequestException('无法获取原始请求体，签名验证失败');
      }
      const isValid = this.verifyGithubSignature(repository.webhookSecret, rawBody, signature);
      if (!isValid) {
        this.logger.warn(`Invalid webhook signature for repository: ${repository.fullName}`);
        throw new BadRequestException('Webhook 签名验证失败');
      }
    } else if (repository.webhookSecret && !signature) {
      // 配置了 Secret 但请求中没有签名头，拒绝
      throw new BadRequestException('缺少 X-Hub-Signature-256 签名头');
    }

    // 4. 将事件加入队列处理
    const enrichedPayload = { ...payload, _githubEvent: githubEvent };
    await this.processEvent(repository.id, 'github', enrichedPayload);
  }

  async handleGitlabWebhook(
    token: string | undefined,
    payload: WebhookPayload,
  ): Promise<void> {
    // 1. 从 Payload 提取仓库的 GitLab external ID
    const projectInfo = payload.project as { id: number; path_with_namespace: string } | undefined;
    if (!projectInfo) {
      throw new BadRequestException('无效的 Payload：缺少 project 字段');
    }

    // 2. 查询数据库获取该仓库的专属 webhookSecret
    const repository = await this.prisma.repository.findFirst({
      where: {
        platform: Platform.GITLAB,
        externalId: String(projectInfo.id),
      },
      select: {
        id: true,
        webhookSecret: true,
        fullName: true,
      },
    });

    if (!repository) {
      this.logger.warn(`Received webhook for unregistered repository: ${projectInfo.path_with_namespace}`);
      return;
    }

    // 3. 验证 GitLab Secret Token
    if (repository.webhookSecret) {
      if (!token || token !== repository.webhookSecret) {
        this.logger.warn(`Invalid GitLab token for repository: ${repository.fullName}`);
        throw new BadRequestException('GitLab Webhook Token 验证失败');
      }
    }

    // 4. 将事件加入队列处理
    await this.processEvent(repository.id, 'gitlab', payload);
  }

  private async processEvent(
    repositoryId: string,
    platform: 'github' | 'gitlab',
    payload: WebhookPayload,
  ): Promise<void> {
    const eventType = this.determineEventType(platform, payload);

    if (!eventType) {
      this.logger.debug(`Ignoring non-processable event from ${platform} for repository ${repositoryId}`);
      return;
    }

    await this.webhookQueue.add('process-webhook-event', {
      repositoryId,
      platform,
      eventType,
      payload,
      receivedAt: new Date().toISOString(),
    });

    this.logger.log(`Queued ${eventType} event for repository ${repositoryId}`);
  }

  private determineEventType(
    platform: 'github' | 'gitlab',
    payload: WebhookPayload,
  ): string | null {
    const eventName = platform === 'github'
      ? (payload as Record<string, unknown>)['_githubEvent']
      : (payload as Record<string, unknown>)['object_kind'];

    if (!eventName) {
      return null;
    }

    if (platform === 'github') {
      switch (eventName) {
        case 'push':
          return 'PUSH';
        case 'pull_request': {
          const action = (payload as { action?: string }).action;
          if (action === 'opened') return 'PR_OPENED';
          if (action === 'closed') {
            const pr = payload as { pull_request?: { merged?: boolean } };
            return pr.pull_request?.merged ? 'PR_MERGED' : 'PR_CLOSED';
          }
          if (action === 'submitted' || action === 'review_requested') return 'PR_REVIEW';
          return null;
        }
        case 'issues': {
          const issueAction = (payload as { action?: string }).action;
          if (issueAction === 'opened') return 'ISSUE_OPENED';
          if (issueAction === 'closed') return 'ISSUE_CLOSED';
          return null;
        }
        case 'issue_comment':
          return 'ISSUE_COMMENT';
        case 'release': {
          const releaseAction = (payload as { action?: string }).action;
          if (releaseAction === 'published') return 'RELEASE';
          return null;
        }
        case 'create':
          return 'BRANCH_CREATED';
        case 'delete': {
          const refType = (payload as { ref_type?: string }).ref_type;
          if (refType === 'branch') return 'BRANCH_DELETED';
          return null;
        }
        default:
          return null;
      }
    }

    if (platform === 'gitlab') {
      switch (eventName) {
        case 'push':
          return 'PUSH';
        case 'merge_request': {
          const mrAction = (payload as { object_attributes?: { action?: string } }).object_attributes?.action;
          if (mrAction === 'open') return 'PR_OPENED';
          if (mrAction === 'merge') return 'PR_MERGED';
          if (mrAction === 'close') return 'PR_CLOSED';
          if (mrAction === 'approved' || mrAction === 'unapproved') return 'PR_REVIEW';
          return null;
        }
        case 'issue': {
          const issueState = (payload as { object_attributes?: { state?: string } }).object_attributes?.state;
          if (issueState === 'opened') return 'ISSUE_OPENED';
          if (issueState === 'closed') return 'ISSUE_CLOSED';
          return null;
        }
        case 'note': {
          const noteableType = (payload as { object_attributes?: { noteable_type?: string } }).object_attributes?.noteable_type;
          if (noteableType === 'Issue') return 'ISSUE_COMMENT';
          if (noteableType === 'MergeRequest') return 'PR_REVIEW';
          return null;
        }
        case 'tag_push':
          return 'RELEASE';
        default:
          return null;
      }
    }

    return null;
  }

  /**
   * 使用 Raw Body Buffer 进行 HMAC SHA256 验签
   * 使用 timingSafeEqual 防止时序攻击
   */
  private verifyGithubSignature(
    secret: string,
    rawBody: Buffer,
    signature: string,
  ): boolean {
    try {
      const hmac = createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(rawBody).digest('hex');

      const digestBuffer = Buffer.from(digest, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'utf8');

      if (digestBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return timingSafeEqual(digestBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }
}
