import type { ApprovalStatus, EventType } from './types';

export const REALTIME_EVENTS = {
  EVENT_CREATED: 'event.created',
  EVENT_REPLAY_DONE: 'event.replay-done',
  APPROVAL_UPDATED: 'approval.updated',
  REPOSITORY_SYNC_PROGRESS: 'repository.sync.progress',
  REPOSITORY_SYNCED: 'repository.synced',
  REPOSITORY_SYNC_FAILED: 'repository.sync.failed',
  ANALYSIS_COMPLETED: 'analysis.completed',
} as const;

export type RealtimeEventName =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export interface EventCreatedPayload {
  eventId: string;
  repositoryId: string;
  eventType: `${EventType}`;
  seq: number;
  createdAt: string;
}

export interface EventReplayDonePayload {
  repositoryId: string;
  replayed: number;
  hasMore: boolean;
  lastSeq: number;
}

export interface ApprovalUpdatedPayload {
  approvalId: string;
  repositoryId: string;
  eventId: string;
  status: `${ApprovalStatus}`;
  updatedAt: string;
}

export type RepositorySyncStage = 'commits' | 'prs' | 'issues' | 'done';

export interface RepositorySyncProgressPayload {
  repositoryId: string;
  jobId: string;
  progress: number;
  stage: RepositorySyncStage;
}

export interface RepositorySyncedPayload {
  repositoryId: string;
  jobId: string;
  durationMs: number;
  syncedAt: string;
}

export interface RepositorySyncFailedPayload {
  repositoryId: string;
  jobId: string;
  reason: string;
  failedAt: string;
}

export interface AnalysisCompletedPayload {
  eventId: string;
  repositoryId: string;
  completedAt: string;
}

export interface RealtimeEventPayloadMap {
  [REALTIME_EVENTS.EVENT_CREATED]: EventCreatedPayload;
  [REALTIME_EVENTS.EVENT_REPLAY_DONE]: EventReplayDonePayload;
  [REALTIME_EVENTS.APPROVAL_UPDATED]: ApprovalUpdatedPayload;
  [REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS]: RepositorySyncProgressPayload;
  [REALTIME_EVENTS.REPOSITORY_SYNCED]: RepositorySyncedPayload;
  [REALTIME_EVENTS.REPOSITORY_SYNC_FAILED]: RepositorySyncFailedPayload;
  [REALTIME_EVENTS.ANALYSIS_COMPLETED]: AnalysisCompletedPayload;
}

export type RealtimeEventPayload<E extends RealtimeEventName> =
  RealtimeEventPayloadMap[E];
