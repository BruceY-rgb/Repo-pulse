import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac } from 'crypto';
import { PrismaClient, Platform } from '@repo-pulse/database';

interface WebhookPayload {
  [key: string]: unknown;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private prisma: PrismaClient;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('webhook-events') private readonly webhookQueue: Queue,
  ) {
    this.prisma = new PrismaClient();
  }

  async handleGithubWebhook(
    signature: string | undefined,
    githubEvent: string | undefined,
    payload: WebhookPayload,
  ): Promise<void> {
    const secret = this.configService.get<string>('WEBHOOK_SECRET');

    // 验证签名（生产环境必须验证）
    if (secret && signature) {
      const isValid = this.verifyGithubSignature(secret, payload, signature);
      if (!isValid) {
        throw new BadRequestException('无效的签名');
      }
    }

    const event = payload.repository as { id: number; full_name: string } | undefined;
    if (!event) {
      throw new BadRequestException('无效的 Payload');
    }

    // 获取仓库
    const repository = await this.prisma.repository.findFirst({
      where: {
        platform: Platform.GITHUB,
        externalId: String(event.id),
      },
    });

    if (!repository) {
      this.logger.warn(`Received webhook for unknown repository: ${event.full_name}`);
      return;
    }

    // 处理事件（将 GitHub event header 注入 payload 以便后续使用）
    const enrichedPayload = { ...payload, _githubEvent: githubEvent };
    await this.processEvent(repository.id, 'github', enrichedPayload);
  }

  async handleGitlabWebhook(
    token: string | undefined,
    payload: WebhookPayload,
  ): Promise<void> {
    const secret = this.configService.get<string>('WEBHOOK_SECRET');

    // 验证 Token
    if (secret && token !== secret) {
      throw new BadRequestException('无效的 Token');
    }

    const event = payload.project as { id: number; path_with_namespace: string } | undefined;
    if (!event) {
      throw new BadRequestException('无效的 Payload');
    }

    // 获取仓库
    const repository = await this.prisma.repository.findFirst({
      where: {
        platform: Platform.GITLAB,
        externalId: String(event.id),
      },
    });

    if (!repository) {
      this.logger.warn(`Received webhook for unknown repository: ${event.path_with_namespace}`);
      return;
    }

    // 处理事件
    await this.processEvent(repository.id, 'gitlab', payload);
  }

  private async processEvent(
    repositoryId: string,
    platform: 'github' | 'gitlab',
    payload: WebhookPayload,
  ): Promise<void> {
    const eventType = this.determineEventType(platform, payload);

    if (!eventType) {
      this.logger.debug(`Ignoring non-processable event from ${platform}`);
      return;
    }

    // 将事件加入队列处理
    await this.webhookQueue.add('process-webhook-event', {
      repositoryId,
      platform,
      eventType,
      payload,
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

    // GitHub 事件映射
    if (platform === 'github') {
      switch (eventName) {
        case 'push':
          return 'PUSH';
        case 'pull_request':
          const action = (payload as { action?: string }).action;
          if (action === 'opened') return 'PR_OPENED';
          if (action === 'closed') {
            const pr = payload as { pull_request?: { merged?: boolean } };
            return pr.pull_request?.merged ? 'PR_MERGED' : 'PR_CLOSED';
          }
          if (action === 'submitted' || action === 'review_requested') return 'PR_REVIEW';
          return null;
        case 'issues':
          const issueAction = (payload as { action?: string }).action;
          if (issueAction === 'opened') return 'ISSUE_OPENED';
          if (issueAction === 'closed') return 'ISSUE_CLOSED';
          return null;
        case 'issue_comment':
          return 'ISSUE_COMMENT';
        case 'release':
          const releaseAction = (payload as { action?: string }).action;
          if (releaseAction === 'published') return 'RELEASE';
          return null;
        case 'create':
          return 'BRANCH_CREATED';
        case 'delete':
          const refType = (payload as { ref_type?: string }).ref_type;
          if (refType === 'branch') return 'BRANCH_DELETED';
          return null;
        default:
          return null;
      }
    }

    // GitLab 事件映射
    if (platform === 'gitlab') {
      switch (eventName) {
        case 'push':
          return 'PUSH';
        case 'merge_request':
          const mrAction = (payload as { object_attributes?: { action?: string } }).object_attributes?.action;
          if (mrAction === 'open') return 'PR_OPENED';
          if (mrAction === 'merge') return 'PR_MERGED';
          if (mrAction === 'close') return 'PR_CLOSED';
          if (mrAction === 'approved' || mrAction === 'unapproved') return 'PR_REVIEW';
          return null;
        case 'issue':
          const issueAction = (payload as { object_attributes?: { state?: string } }).object_attributes?.state;
          if (issueAction === 'opened') return 'ISSUE_OPENED';
          if (issueAction === 'closed') return 'ISSUE_CLOSED';
          return null;
        case 'note':
          const noteableType = (payload as { object_attributes?: { noteable_type?: string } }).object_attributes?.noteable_type;
          if (noteableType === 'Issue') return 'ISSUE_COMMENT';
          if (noteableType === 'MergeRequest') return 'PR_REVIEW';
          return null;
        case 'tag_push':
          return 'RELEASE';
        default:
          return null;
      }
    }

    return null;
  }

  private verifyGithubSignature(
    secret: string,
    payload: unknown,
    signature: string,
  ): boolean {
    const payloadString = JSON.stringify(payload);
    const hmac = createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payloadString).digest('hex');
    return digest === signature;
  }
}
