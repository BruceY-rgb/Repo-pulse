import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, BadRequestException } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaClient, EventType } from '@repo-pulse/database';
import { EventService } from './event.service';
import {
  mergeMetadata,
  resolveGithubWebhookOccurredAt,
  resolveGitlabWebhookOccurredAt,
} from './event-time.util';

interface WebhookEventJob {
  repositoryId: string;
  platform: 'github' | 'gitlab';
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt?: string;
}

@Processor('webhook-events')
export class EventProcessor extends WorkerHost {
  private readonly logger = new Logger(EventProcessor.name);
  private prisma: PrismaClient;

  constructor(private readonly eventService: EventService) {
    super();
    this.prisma = new PrismaClient();
  }

  async process(job: Job<WebhookEventJob>): Promise<void> {
    const { repositoryId, platform, eventType, payload } = job.data;
    const receivedAt = job.data.receivedAt ? new Date(job.data.receivedAt) : new Date();

    this.logger.log(`Processing ${eventType} event for repository ${repositoryId}`);

    try {
      // 检查是否已存在相同 externalId 的事件（防止重复处理）
      const externalId = this.extractExternalId(platform, eventType, payload);
      const existing = await this.eventService.findByExternalId(repositoryId, externalId);

      if (existing) {
        this.logger.warn(`Event ${externalId} already exists, skipping`);
        return;
      }

      // 标准化事件数据
      const eventData = this.normalizeEventData(platform, eventType, payload);
      const timeResolution =
        platform === 'github'
          ? resolveGithubWebhookOccurredAt(eventData.type, payload, receivedAt)
          : resolveGitlabWebhookOccurredAt(eventData.type, payload, receivedAt);

      // 存储事件
      await this.eventService.create({
        repositoryId,
        type: eventData.type,
        action: eventData.action,
        title: eventData.title,
        body: eventData.body,
        author: eventData.author,
        authorAvatar: eventData.authorAvatar,
        externalId,
        externalUrl: eventData.externalUrl,
        metadata: mergeMetadata(eventData.metadata, timeResolution.metadataPatch),
        rawPayload: payload,
        occurredAt: timeResolution.occurredAt,
      });

      this.logger.log(`Event ${externalId} processed successfully`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to process event: ${err.message}`, err.stack);
      throw new BadRequestException(`事件处理失败: ${err.message}`);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }

  private extractExternalId(platform: string, eventType: string, payload: Record<string, unknown>): string {
    if (platform === 'github') {
      switch (eventType) {
        case 'PUSH':
          return String((payload as { after?: string }).after || Date.now());
        case 'PR_OPENED':
        case 'PR_MERGED':
        case 'PR_CLOSED':
        case 'PR_REVIEW':
          return String((payload as { pull_request?: { id?: number } }).pull_request?.id);
        case 'ISSUE_OPENED':
        case 'ISSUE_CLOSED':
          return String((payload as { issue?: { id?: number } }).issue?.id);
        case 'ISSUE_COMMENT':
          return String((payload as { comment?: { id?: number } }).comment?.id);
        case 'RELEASE':
          return String((payload as { release?: { tag_name?: string } }).release?.tag_name);
        default:
          return String(Date.now());
      }
    } else {
      // GitLab
      switch (eventType) {
        case 'PUSH':
          return String((payload as { checkout_sha?: string }).checkout_sha || Date.now());
        case 'PR_OPENED':
        case 'PR_MERGED':
        case 'PR_CLOSED':
        case 'PR_REVIEW':
          return String((payload as { object_attributes?: { id?: number } }).object_attributes?.id);
        case 'ISSUE_OPENED':
        case 'ISSUE_CLOSED':
          return String((payload as { object_attributes?: { id?: number } }).object_attributes?.id);
        case 'ISSUE_COMMENT':
        case 'PR_REVIEW':
          return String((payload as { object_attributes?: { id?: number } }).object_attributes?.id);
        default:
          return String(Date.now());
      }
    }
  }

  private normalizeEventData(
    platform: 'github' | 'gitlab',
    eventType: string,
    payload: Record<string, unknown>,
  ): {
    type: EventType;
    action: string;
    title: string;
    body?: string;
    author: string;
    authorAvatar?: string;
    externalUrl?: string;
    metadata: Record<string, unknown>;
  } {
    if (platform === 'github') {
      return this.normalizeGithubEvent(eventType, payload);
    } else {
      return this.normalizeGitlabEvent(eventType, payload);
    }
  }

  private normalizeGithubEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): {
    type: EventType;
    action: string;
    title: string;
    body?: string;
    author: string;
    authorAvatar?: string;
    externalUrl?: string;
    metadata: Record<string, unknown>;
  } {
    const repo = payload.repository as { full_name: string } | undefined;
    const sender = payload.sender as { login: string; avatar_url: string } | undefined;

    switch (eventType) {
      case 'PUSH': {
        const commits = payload.commits as Array<{ message: string; author: { name: string } }> | undefined;
        const ref = payload.ref as string | undefined;
        return {
          type: EventType.PUSH,
          action: 'push',
          title: `Push to ${ref?.replace('refs/heads/', '') || 'unknown'}`,
          body: commits?.[0]?.message,
          author: commits?.[0]?.author?.name || sender?.login || 'unknown',
          authorAvatar: sender?.avatar_url,
          externalUrl: undefined,
          metadata: {
            branch: ref?.replace('refs/heads/', ''),
            commitsCount: commits?.length || 0,
          },
        };
      }
      case 'PR_OPENED': {
        const pr = payload.pull_request as {
          title: string;
          body: string;
          user: { login: string; avatar_url: string };
          html_url: string;
          number: number;
        } | undefined;
        return {
          type: EventType.PR_OPENED,
          action: 'opened',
          title: pr?.title || 'PR Opened',
          body: pr?.body,
          author: pr?.user?.login || 'unknown',
          authorAvatar: pr?.user?.avatar_url,
          externalUrl: pr?.html_url,
          metadata: {
            prNumber: pr?.number,
          },
        };
      }
      case 'PR_MERGED': {
        const pr = payload.pull_request as {
          title: string;
          body: string;
          user: { login: string; avatar_url: string };
          html_url: string;
          number: number;
          merged_at: string;
        } | undefined;
        return {
          type: EventType.PR_MERGED,
          action: 'merged',
          title: pr?.title || 'PR Merged',
          body: pr?.body,
          author: pr?.user?.login || 'unknown',
          authorAvatar: pr?.user?.avatar_url,
          externalUrl: pr?.html_url,
          metadata: {
            prNumber: pr?.number,
            mergedAt: pr?.merged_at,
          },
        };
      }
      case 'PR_CLOSED': {
        const pr = payload.pull_request as {
          title: string;
          body: string;
          user: { login: string; avatar_url: string };
          html_url: string;
          number: number;
        } | undefined;
        return {
          type: EventType.PR_CLOSED,
          action: 'closed',
          title: pr?.title || 'PR Closed',
          body: pr?.body,
          author: pr?.user?.login || 'unknown',
          authorAvatar: pr?.user?.avatar_url,
          externalUrl: pr?.html_url,
          metadata: {
            prNumber: pr?.number,
          },
        };
      }
      case 'PR_REVIEW': {
        const pr = payload.pull_request as {
          title: string;
          user: { login: string; avatar_url: string };
          html_url: string;
          number: number;
        } | undefined;
        const review = payload.review as { body?: string; user: { login: string; avatar_url: string } } | undefined;
        return {
          type: EventType.PR_REVIEW,
          action: (payload as { action?: string }).action || 'reviewed',
          title: pr?.title || 'PR Review',
          body: review?.body,
          author: review?.user?.login || sender?.login || 'unknown',
          authorAvatar: review?.user?.avatar_url || sender?.avatar_url,
          externalUrl: pr?.html_url,
          metadata: {
            prNumber: pr?.number,
          },
        };
      }
      case 'ISSUE_OPENED': {
        const issue = payload.issue as {
          title: string;
          body: string;
          user: { login: string; avatar_url: string };
          html_url: string;
          number: number;
        } | undefined;
        return {
          type: EventType.ISSUE_OPENED,
          action: 'opened',
          title: issue?.title || 'Issue Opened',
          body: issue?.body,
          author: issue?.user?.login || 'unknown',
          authorAvatar: issue?.user?.avatar_url,
          externalUrl: issue?.html_url,
          metadata: {
            issueNumber: issue?.number,
          },
        };
      }
      case 'ISSUE_CLOSED': {
        const issue = payload.issue as {
          title: string;
          body: string;
          user: { login: string; avatar_url: string };
          html_url: string;
          number: number;
        } | undefined;
        return {
          type: EventType.ISSUE_CLOSED,
          action: 'closed',
          title: issue?.title || 'Issue Closed',
          body: issue?.body,
          author: issue?.user?.login || 'unknown',
          authorAvatar: issue?.user?.avatar_url,
          externalUrl: issue?.html_url,
          metadata: {
            issueNumber: issue?.number,
          },
        };
      }
      case 'ISSUE_COMMENT': {
        const comment = payload.comment as {
          body: string;
          user: { login: string; avatar_url: string };
          html_url: string;
        } | undefined;
        const issue = payload.issue as { title: string; number: number } | undefined;
        return {
          type: EventType.ISSUE_COMMENT,
          action: 'commented',
          title: `Comment on: ${issue?.title || 'Issue'}`,
          body: comment?.body,
          author: comment?.user?.login || sender?.login || 'unknown',
          authorAvatar: comment?.user?.avatar_url || sender?.avatar_url,
          externalUrl: comment?.html_url,
          metadata: {
            issueNumber: issue?.number,
          },
        };
      }
      case 'RELEASE': {
        const release = payload.release as {
          tag_name: string;
          name: string;
          body: string;
          author: { login: string; avatar_url: string };
          html_url: string;
        } | undefined;
        return {
          type: EventType.RELEASE,
          action: 'published',
          title: release?.name || `Release ${release?.tag_name}`,
          body: release?.body,
          author: release?.author?.login || sender?.login || 'unknown',
          authorAvatar: release?.author?.avatar_url || sender?.avatar_url,
          externalUrl: release?.html_url,
          metadata: {
            tagName: release?.tag_name,
          },
        };
      }
      case 'BRANCH_CREATED': {
        const ref = payload.ref as string | undefined;
        return {
          type: EventType.BRANCH_CREATED,
          action: 'created',
          title: `Branch created: ${ref}`,
          author: sender?.login || 'unknown',
          authorAvatar: sender?.avatar_url,
          externalUrl: undefined,
          metadata: {
            branch: ref,
          },
        };
      }
      case 'BRANCH_DELETED': {
        const ref = payload.ref as string | undefined;
        const refType = payload.ref_type as string | undefined;
        return {
          type: EventType.BRANCH_DELETED,
          action: 'deleted',
          title: `${refType === 'branch' ? 'Branch' : 'Tag'} deleted: ${ref}`,
          author: sender?.login || 'unknown',
          authorAvatar: sender?.avatar_url,
          externalUrl: undefined,
          metadata: {
            branch: ref,
            refType,
          },
        };
      }
      default:
        return {
          type: EventType.PUSH,
          action: 'unknown',
          title: 'Unknown Event',
          author: sender?.login || 'unknown',
          authorAvatar: sender?.avatar_url,
          externalUrl: undefined,
          metadata: {},
        };
    }
  }

  private normalizeGitlabEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): {
    type: EventType;
    action: string;
    title: string;
    body?: string;
    author: string;
    authorAvatar?: string;
    externalUrl?: string;
    metadata: Record<string, unknown>;
  } {
    const project = payload.project as { path_with_namespace: string; web_url: string } | undefined;
    const user = payload.user as { username: string; avatar_url: string } | undefined;
    const objectAttributes = payload.object_attributes as Record<string, unknown> | undefined;

    switch (eventType) {
      case 'PUSH': {
        const commits = payload.commits as Array<{ message: string; author: { name: string } }> | undefined;
        const ref = payload.ref as string | undefined;
        return {
          type: EventType.PUSH,
          action: 'push',
          title: `Push to ${ref?.replace('refs/heads/', '') || 'unknown'}`,
          body: commits?.[0]?.message,
          author: commits?.[0]?.author?.name || user?.username || 'unknown',
          authorAvatar: user?.avatar_url,
          externalUrl: project?.web_url,
          metadata: {
            branch: ref?.replace('refs/heads/', ''),
            commitsCount: commits?.length || 0,
          },
        };
      }
      case 'PR_OPENED': {
        return {
          type: EventType.PR_OPENED,
          action: 'open',
          title: String(objectAttributes?.title || 'MR Opened'),
          body: String(objectAttributes?.description || ''),
          author: String(objectAttributes?.author_id || user?.username || 'unknown'),
          authorAvatar: user?.avatar_url,
          externalUrl: String(objectAttributes?.url || project?.web_url),
          metadata: {
            mrIid: objectAttributes?.iid,
          },
        };
      }
      case 'PR_MERGED': {
        return {
          type: EventType.PR_MERGED,
          action: 'merge',
          title: String(objectAttributes?.title || 'MR Merged'),
          body: String(objectAttributes?.description || ''),
          author: String(objectAttributes?.author_id || user?.username || 'unknown'),
          authorAvatar: user?.avatar_url,
          externalUrl: String(objectAttributes?.url || project?.web_url),
          metadata: {
            mrIid: objectAttributes?.iid,
          },
        };
      }
      case 'PR_CLOSED': {
        return {
          type: EventType.PR_CLOSED,
          action: 'close',
          title: String(objectAttributes?.title || 'MR Closed'),
          body: String(objectAttributes?.description || ''),
          author: String(objectAttributes?.author_id || user?.username || 'unknown'),
          authorAvatar: user?.avatar_url,
          externalUrl: String(objectAttributes?.url || project?.web_url),
          metadata: {
            mrIid: objectAttributes?.iid,
          },
        };
      }
      case 'PR_REVIEW': {
        const note = payload.note as { body: string } | undefined;
        return {
          type: EventType.PR_REVIEW,
          action: String(objectAttributes?.action || 'reviewed'),
          title: String(objectAttributes?.title || 'MR Review'),
          body: note?.body,
          author: user?.username || 'unknown',
          authorAvatar: user?.avatar_url,
          externalUrl: String(objectAttributes?.url || project?.web_url),
          metadata: {
            mrIid: objectAttributes?.iid,
          },
        };
      }
      case 'ISSUE_OPENED': {
        return {
          type: EventType.ISSUE_OPENED,
          action: 'open',
          title: String(objectAttributes?.title || 'Issue Opened'),
          body: String(objectAttributes?.description || ''),
          author: String(objectAttributes?.author_id || user?.username || 'unknown'),
          authorAvatar: user?.avatar_url,
          externalUrl: String(objectAttributes?.url || project?.web_url),
          metadata: {
            issueIid: objectAttributes?.iid,
          },
        };
      }
      case 'ISSUE_CLOSED': {
        return {
          type: EventType.ISSUE_CLOSED,
          action: 'close',
          title: String(objectAttributes?.title || 'Issue Closed'),
          body: String(objectAttributes?.description || ''),
          author: String(objectAttributes?.author_id || user?.username || 'unknown'),
          authorAvatar: user?.avatar_url,
          externalUrl: String(objectAttributes?.url || project?.web_url),
          metadata: {
            issueIid: objectAttributes?.iid,
          },
        };
      }
      case 'ISSUE_COMMENT': {
        const note = payload.note as { body: string } | undefined;
        return {
          type: EventType.ISSUE_COMMENT,
          action: 'commented',
          title: `Comment on: ${objectAttributes?.title || 'Issue'}`,
          body: note?.body,
          author: user?.username || 'unknown',
          authorAvatar: user?.avatar_url,
          externalUrl: String(objectAttributes?.url || project?.web_url),
          metadata: {
            issueIid: objectAttributes?.iid,
          },
        };
      }
      case 'RELEASE': {
        const tag = payload.tag as { name: string } | undefined;
        return {
          type: EventType.RELEASE,
          action: 'published',
          title: tag?.name ? `Release ${tag.name}` : 'Release Published',
          body: String(objectAttributes?.description || ''),
          author: user?.username || 'unknown',
          authorAvatar: user?.avatar_url,
          externalUrl: String(project?.web_url),
          metadata: {
            tagName: tag?.name,
          },
        };
      }
      default:
        return {
          type: EventType.PUSH,
          action: 'unknown',
          title: 'Unknown Event',
          author: user?.username || 'unknown',
          authorAvatar: user?.avatar_url,
          externalUrl: project?.web_url,
          metadata: {},
        };
    }
  }
}
