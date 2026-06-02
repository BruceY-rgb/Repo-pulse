import type { ApprovalStatus, EventType } from './types';

export const REALTIME_EVENTS = {
  EVENT_CREATED: 'event.created',
  EVENT_REPLAY_DONE: 'event.replay-done',
  APPROVAL_UPDATED: 'approval.updated',
  REPOSITORY_SYNC_PROGRESS: 'repository.sync.progress',
  REPOSITORY_SYNCED: 'repository.synced',
  REPOSITORY_SYNC_FAILED: 'repository.sync.failed',
  ANALYSIS_COMPLETED: 'analysis.completed',
  ANALYSIS_STARTED: 'analysis.started',
  ANALYSIS_FAILED: 'analysis.failed',
  NOTIFICATION_NEW: 'notification.new',
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

export interface AnalysisStartedPayload {
  eventId: string;
  repositoryId: string;
  startedAt: string;
  source: 'auto' | 'manual';
}

export interface AnalysisFailedPayload {
  eventId: string;
  repositoryId: string;
  failedAt: string;
  reason: string;
}

export interface NotificationNewPayload {
  userId: string;
  unreadCount: number;
  notification: {
    id: string;
    title: string;
    content: string;
    eventId?: string | null;
    createdAt: string;
  };
}

export interface EventReplayDonePayload {
  repositoryId: string;
  replayed: number;
  hasMore: boolean;
  lastSeq: number;
}

export interface RealtimeEventPayloadMap {
  [REALTIME_EVENTS.EVENT_CREATED]: EventCreatedPayload;
  [REALTIME_EVENTS.EVENT_REPLAY_DONE]: EventReplayDonePayload;
  [REALTIME_EVENTS.APPROVAL_UPDATED]: ApprovalUpdatedPayload;
  [REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS]: RepositorySyncProgressPayload;
  [REALTIME_EVENTS.REPOSITORY_SYNCED]: RepositorySyncedPayload;
  [REALTIME_EVENTS.REPOSITORY_SYNC_FAILED]: RepositorySyncFailedPayload;
  [REALTIME_EVENTS.ANALYSIS_COMPLETED]: AnalysisCompletedPayload;
  [REALTIME_EVENTS.ANALYSIS_STARTED]: AnalysisStartedPayload;
  [REALTIME_EVENTS.ANALYSIS_FAILED]: AnalysisFailedPayload;
  [REALTIME_EVENTS.NOTIFICATION_NEW]: NotificationNewPayload;
}

export type RealtimeEventPayload<E extends RealtimeEventName> =
  RealtimeEventPayloadMap[E];

/**
 * 桌面端（Electron）单一 IPC 信封通道载荷。
 *
 * 主进程把 socket.io 收到的实时事件统一封装为 { name, payload }，经
 * 'desktop:realtime' 通道转发给渲染进程；渲染进程按 name 分发到对应处理器。
 * 仅类型层面新增，不改动 REALTIME_EVENTS（不影响处理器穷尽性约束）。
 */
export type DesktopRealtimeMessage = {
  [K in RealtimeEventName]: { name: K; payload: RealtimeEventPayloadMap[K] };
}[RealtimeEventName];
