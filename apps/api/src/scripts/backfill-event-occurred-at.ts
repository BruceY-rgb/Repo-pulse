import { ConfigService } from '@nestjs/config';
import {
  EventType,
  Platform,
  Prisma,
  PrismaClient,
} from '@repo-pulse/database';
import { GithubService } from '../modules/repository/services/github.service';
import { GitlabService } from '../modules/repository/services/gitlab.service';
import {
  mergeMetadata,
  resolveGithubWebhookOccurredAt,
  resolveGitlabWebhookOccurredAt,
} from '../modules/event/event-time.util';

const prisma = new PrismaClient();
const configService = new ConfigService();
const githubService = new GithubService(configService);
const gitlabService = new GitlabService(configService);

const DRY_RUN = process.argv.includes('--write') ? false : true;
const BATCH_SIZE = Number(process.env.EVENT_BACKFILL_BATCH_SIZE || 100);
const RETENTION_DAYS = Number(process.env.EVENT_BACKFILL_RETENTION_DAYS || 90);

type EventRow = Prisma.EventGetPayload<{
  include: {
    repository: {
      include: {
        users: {
          include: {
            user: {
              select: {
                githubAccessToken: true;
                githubRefreshToken: true;
              };
            };
          };
        };
      };
    };
  };
}>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseRepositoryPath(fullName: string): [string, string] {
  const separatorIndex = fullName.lastIndexOf('/');
  if (separatorIndex === -1) {
    return [fullName, fullName];
  }

  return [fullName.slice(0, separatorIndex), fullName.slice(separatorIndex + 1)];
}

function isLegacyHistorySync(event: EventRow): boolean {
  const metadata = asRecord(event.metadata);
  const source = typeof metadata?.source === 'string' ? metadata.source : undefined;
  return source === 'legacy_history_sync' || (!event.rawPayload && !source);
}

async function resolveOccurredAtViaApi(event: EventRow): Promise<Date | null> {
  const metadata = asRecord(event.metadata);
  const [owner, repo] = parseRepositoryPath(event.repository.fullName);
  const githubToken = event.repository.users[0]?.user.githubAccessToken || undefined;

  if (event.repository.platform === Platform.GITHUB) {
    if (event.type === EventType.PUSH) {
      const commit = await githubService.getCommit(owner, repo, event.externalId, githubToken);
      return commit?.commit?.author?.date ? new Date(commit.commit.author.date) : null;
    }

    if (
      event.type === EventType.PR_OPENED ||
      event.type === EventType.PR_MERGED ||
      event.type === EventType.PR_CLOSED
    ) {
      const prNumber = Number(metadata?.prNumber);
      if (!Number.isFinite(prNumber)) {
        return null;
      }
      const pr = await githubService.getPullRequest(owner, repo, prNumber, githubToken);
      if (!pr) {
        return null;
      }
      if (event.type === EventType.PR_MERGED) {
        return new Date(pr.merged_at || pr.closed_at || pr.updated_at || pr.created_at || event.createdAt);
      }
      if (event.type === EventType.PR_CLOSED) {
        return new Date(pr.closed_at || pr.updated_at || pr.created_at || event.createdAt);
      }
      return new Date(pr.created_at || pr.updated_at || event.createdAt);
    }

    if (event.type === EventType.ISSUE_OPENED || event.type === EventType.ISSUE_CLOSED) {
      const issueNumber = Number(metadata?.issueNumber);
      if (!Number.isFinite(issueNumber)) {
        return null;
      }
      const issue = await githubService.getIssue(owner, repo, issueNumber, githubToken);
      if (!issue) {
        return null;
      }
      if (event.type === EventType.ISSUE_CLOSED) {
        return new Date(issue.closed_at || issue.updated_at || issue.created_at || event.createdAt);
      }
      return new Date(issue.created_at || issue.updated_at || event.createdAt);
    }

    return null;
  }

  if (event.type === EventType.PUSH) {
    const commit = await gitlabService.getCommit(owner, repo, event.externalId);
    return commit
      ? new Date(commit.authored_date || commit.committed_date || commit.created_at || event.createdAt)
      : null;
  }

  if (
    event.type === EventType.PR_OPENED ||
    event.type === EventType.PR_MERGED ||
    event.type === EventType.PR_CLOSED
  ) {
    const mrIid = Number(metadata?.mrIid);
    if (!Number.isFinite(mrIid)) {
      return null;
    }
    const mr = await gitlabService.getMergeRequest(owner, repo, mrIid);
    if (!mr) {
      return null;
    }
    if (event.type === EventType.PR_MERGED) {
      return new Date(mr.merged_at || mr.closed_at || mr.updated_at || mr.created_at || event.createdAt);
    }
    if (event.type === EventType.PR_CLOSED) {
      return new Date(mr.closed_at || mr.updated_at || mr.created_at || event.createdAt);
    }
    return new Date(mr.created_at || mr.updated_at || event.createdAt);
  }

  if (event.type === EventType.ISSUE_OPENED || event.type === EventType.ISSUE_CLOSED) {
    const issueIid = Number(metadata?.issueIid);
    if (!Number.isFinite(issueIid)) {
      return null;
    }
    const issue = await gitlabService.getIssue(owner, repo, issueIid);
    if (!issue) {
      return null;
    }
    if (event.type === EventType.ISSUE_CLOSED) {
      return new Date(issue.closed_at || issue.updated_at || issue.created_at || event.createdAt);
    }
    return new Date(issue.created_at || issue.updated_at || event.createdAt);
  }

  return null;
}

async function resolveBackfill(event: EventRow): Promise<{
  occurredAt: Date;
  metadata: Record<string, unknown>;
  status: string;
}> {
  const metadata = asRecord(event.metadata) ?? {};

  if (event.rawPayload) {
    const payload = asRecord(event.rawPayload);
    if (payload) {
      const timeResolution =
        event.repository.platform === Platform.GITHUB
          ? resolveGithubWebhookOccurredAt(event.type, payload, event.createdAt)
          : resolveGitlabWebhookOccurredAt(event.type, payload, event.createdAt);

      return {
        occurredAt: timeResolution.occurredAt,
        metadata: mergeMetadata(metadata, {
          ...timeResolution.metadataPatch,
          timeBackfillStatus: 'from_raw_payload',
        }) ?? metadata,
        status: 'from_raw_payload',
      };
    }
  }

  if (isLegacyHistorySync(event)) {
    return {
      occurredAt: event.createdAt,
      metadata: mergeMetadata(metadata, {
        source: metadata.source ?? 'legacy_history_sync',
        timeBackfillStatus: 'legacy_createdAt',
      }) ?? metadata,
      status: 'legacy_createdAt',
    };
  }

  const recoveredAt = await resolveOccurredAtViaApi(event);
  if (recoveredAt) {
    return {
      occurredAt: recoveredAt,
      metadata: mergeMetadata(metadata, {
        timeBackfillStatus: 'recovered_via_api',
      }) ?? metadata,
      status: 'recovered_via_api',
    };
  }

  return {
    occurredAt: event.createdAt,
    metadata: mergeMetadata(metadata, {
      timeBackfillStatus: 'fallback_createdAt',
    }) ?? metadata,
    status: 'fallback_createdAt',
  };
}

async function processBatch(events: EventRow[]) {
  for (const event of events) {
    const result = await resolveBackfill(event);
    const summary = `event=${event.id} repo=${event.repository.fullName} type=${event.type} status=${result.status} occurredAt=${result.occurredAt.toISOString()}`;

    if (DRY_RUN) {
      console.log(`[dry-run] ${summary}`);
      continue;
    }

    await prisma.event.update({
      where: { id: event.id },
      data: {
        occurredAt: result.occurredAt,
        metadata: result.metadata as Prisma.InputJsonValue,
      },
    });
    console.log(summary);
  }
}

async function main() {
  const retentionBoundary = new Date();
  retentionBoundary.setDate(retentionBoundary.getDate() - RETENTION_DAYS);

  let cursor: string | undefined;
  let total = 0;

  while (true) {
    const events = await prisma.event.findMany({
      where: {
        occurredAt: null,
      },
      include: {
        repository: {
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
        },
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: BATCH_SIZE,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
    });

    if (events.length === 0) {
      break;
    }

    const prioritized = [
      ...events.filter((event) => event.createdAt >= retentionBoundary),
      ...events.filter((event) => event.createdAt < retentionBoundary),
    ];

    await processBatch(prioritized);
    total += prioritized.length;
    cursor = events[events.length - 1]?.id;
  }

  console.log(
    `${DRY_RUN ? 'Dry-run scanned' : 'Backfilled'} ${total} events with missing occurredAt.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
