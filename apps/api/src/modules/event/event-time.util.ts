import { EventType } from '@repo-pulse/database';

type Metadata = Record<string, unknown>;

export interface EventTimeResolution {
  occurredAt: Date;
  metadataPatch?: Metadata;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function parseDate(value: unknown): Date | undefined {
  const raw = asString(value);
  if (!raw) {
    return undefined;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function firstDate(...values: unknown[]): Date | undefined {
  for (const value of values) {
    const date = parseDate(value);
    if (date) {
      return date;
    }
  }

  return undefined;
}

function withTimeSource(metadataPatch: Metadata | undefined, timeSource: string): Metadata {
  return {
    ...(metadataPatch ?? {}),
    timeSource,
  };
}

export function resolveGithubWebhookOccurredAt(
  eventType: EventType,
  payload: Record<string, unknown>,
  receivedAt: Date,
): EventTimeResolution {
  const pullRequest = asRecord(payload.pull_request);
  const issue = asRecord(payload.issue);
  const comment = asRecord(payload.comment);
  const review = asRecord(payload.review);
  const release = asRecord(payload.release);

  switch (eventType) {
    case EventType.PUSH: {
      const headCommit = asRecord(payload.head_commit);
      const commits = Array.isArray(payload.commits) ? payload.commits : [];
      const firstCommit = asRecord(commits[commits.length - 1]);
      const commitData = headCommit ?? firstCommit;
      const commitAuthor = asRecord(commitData?.author);
      const occurredAt =
        firstDate(commitData?.timestamp, commitAuthor?.date) ?? receivedAt;
      return { occurredAt };
    }
    case EventType.PR_OPENED:
      return {
        occurredAt: firstDate(pullRequest?.created_at) ?? receivedAt,
      };
    case EventType.PR_MERGED:
      return {
        occurredAt:
          firstDate(pullRequest?.merged_at, pullRequest?.closed_at, pullRequest?.updated_at) ??
          receivedAt,
      };
    case EventType.PR_CLOSED:
      return {
        occurredAt: firstDate(pullRequest?.closed_at, pullRequest?.updated_at) ?? receivedAt,
      };
    case EventType.PR_REVIEW:
      return {
        occurredAt: firstDate(review?.submitted_at, review?.created_at) ?? receivedAt,
      };
    case EventType.ISSUE_OPENED:
      return {
        occurredAt: firstDate(issue?.created_at) ?? receivedAt,
      };
    case EventType.ISSUE_CLOSED:
      return {
        occurredAt: firstDate(issue?.closed_at, issue?.updated_at) ?? receivedAt,
      };
    case EventType.ISSUE_COMMENT:
      return {
        occurredAt: firstDate(comment?.created_at) ?? receivedAt,
      };
    case EventType.RELEASE:
      return {
        occurredAt: firstDate(release?.published_at, release?.created_at) ?? receivedAt,
      };
    case EventType.BRANCH_CREATED:
    case EventType.BRANCH_DELETED:
      return {
        occurredAt: receivedAt,
        metadataPatch: withTimeSource(undefined, 'delivery_time_fallback'),
      };
    default:
      return { occurredAt: receivedAt };
  }
}

export function resolveGitlabWebhookOccurredAt(
  eventType: EventType,
  payload: Record<string, unknown>,
  receivedAt: Date,
): EventTimeResolution {
  const objectAttributes = asRecord(payload.object_attributes);
  const commit = asRecord(payload.commit);
  const note = asRecord(payload.object_attributes);
  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  const lastCommit = asRecord(commits[commits.length - 1]);
  const release = asRecord(payload.release);

  switch (eventType) {
    case EventType.PUSH: {
      const occurredAt =
        firstDate(commit?.timestamp, lastCommit?.timestamp, payload.after) ?? receivedAt;
      return { occurredAt };
    }
    case EventType.PR_OPENED:
      return {
        occurredAt: firstDate(objectAttributes?.created_at) ?? receivedAt,
      };
    case EventType.PR_MERGED:
      return {
        occurredAt:
          firstDate(objectAttributes?.merged_at, objectAttributes?.closed_at, objectAttributes?.updated_at) ??
          receivedAt,
      };
    case EventType.PR_CLOSED:
      return {
        occurredAt: firstDate(objectAttributes?.closed_at, objectAttributes?.updated_at) ?? receivedAt,
      };
    case EventType.PR_REVIEW:
      return {
        occurredAt: firstDate(note?.created_at, objectAttributes?.created_at) ?? receivedAt,
      };
    case EventType.ISSUE_OPENED:
      return {
        occurredAt: firstDate(objectAttributes?.created_at) ?? receivedAt,
      };
    case EventType.ISSUE_CLOSED:
      return {
        occurredAt: firstDate(objectAttributes?.closed_at, objectAttributes?.updated_at) ?? receivedAt,
      };
    case EventType.ISSUE_COMMENT:
      return {
        occurredAt: firstDate(note?.created_at, objectAttributes?.created_at) ?? receivedAt,
      };
    case EventType.RELEASE:
      return {
        occurredAt:
          firstDate(release?.released_at, release?.created_at, objectAttributes?.created_at) ??
          receivedAt,
      };
    case EventType.BRANCH_CREATED:
    case EventType.BRANCH_DELETED:
      return {
        occurredAt: receivedAt,
        metadataPatch: withTimeSource(undefined, 'delivery_time_fallback'),
      };
    default:
      return { occurredAt: receivedAt };
  }
}

export function mergeMetadata(
  base: Metadata | undefined,
  patch: Metadata | undefined,
): Metadata | undefined {
  if (!patch) {
    return base;
  }

  return {
    ...(base ?? {}),
    ...patch,
  };
}
