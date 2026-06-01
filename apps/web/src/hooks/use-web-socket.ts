import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { dashboardQueryKeys } from '@/hooks/queries/use-dashboard-queries';
import { notificationQueryKeys } from '@/hooks/queries/use-notification-queries';
import { repositoryQueryKeys } from '@/hooks/queries/use-repository-queries';
import { workbenchQueryKeys } from '@/hooks/queries/use-workbench-queries';
import { analysisQueryKeys } from '@/hooks/use-analysis';
import { approvalKeys } from '@/hooks/use-approvals';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { getSocketUrl } from '@/lib/desktop';
import { useWorkbenchUnreadStore } from '@/stores/workbench-unread.store';

export const REALTIME_INVALIDATION_BUDGET_MS = 50;
const REALTIME_LAST_SEQ_STORAGE_KEY = 'repo-pulse:realtime:last-seq';

const REALTIME_EVENTS = {
  EVENT_CREATED: 'event.created',
  EVENT_REPLAY_DONE: 'event.replay-done',
  APPROVAL_UPDATED: 'approval.updated',
  REPOSITORY_SYNC_PROGRESS: 'repository.sync.progress',
  REPOSITORY_SYNCED: 'repository.synced',
  REPOSITORY_SYNC_FAILED: 'repository.sync.failed',
  ANALYSIS_COMPLETED: 'analysis.completed',
} as const;

type RealtimeEventName =
  | 'event:new'
  | 'events:new'
  | 'analysis:completed'
  | (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];
type RealtimeQueryClient = Pick<QueryClient, 'invalidateQueries'>;

interface RepositoryRealtimePayload {
  repositoryId?: string;
  data?: unknown;
  timestamp?: string;
}

interface EventCreatedPayload {
  eventId: string;
  repositoryId: string;
  eventType: string;
  seq: number;
  createdAt: string;
}

interface EventReplayDonePayload {
  repositoryId: string;
  lastSeq: number;
}

interface RepositorySyncPayload {
  repositoryId: string;
  jobId: string;
  progress?: number;
  stage?: string;
  reason?: string;
}

interface RealtimeDeliveryMark {
  deliveryId: number;
  eventName: RealtimeEventName;
  repositoryId?: string;
  seq?: number;
  receivedAt: number;
  receivedAtEpoch: number;
  renderTracked: boolean;
}

interface RealtimeTelemetryEvent {
  deliveryId: number;
  eventName: RealtimeEventName;
  repositoryId?: string;
  seq?: number;
  receivedAtEpoch: number;
  renderedAtEpoch?: number;
  deliveryToRenderMs?: number;
  scheduleMs?: number;
}

interface RealtimeTelemetrySnapshot {
  delivered: number;
  rendered: number;
  renderRate: number;
  avgDeliveryToRenderMs: number;
  p95DeliveryToRenderMs: number;
  byEvent: Record<string, { delivered: number; rendered: number }>;
  recent: RealtimeTelemetryEvent[];
}

declare global {
  interface Window {
    __REPO_PULSE_REALTIME_METRICS__?: {
      snapshot: () => RealtimeTelemetrySnapshot;
      reset: () => void;
    };
  }
}

type LastSeqMap = Record<string, number>;
type EventCounter = { delivered: number; rendered: number };

let realtimeDeliveryId = 0;
const realtimeTelemetry = {
  delivered: 0,
  rendered: 0,
  byEvent: {} as Record<string, EventCounter>,
  recent: [] as RealtimeTelemetryEvent[],
  latencies: [] as number[],
};

function readLastSeqMap(): LastSeqMap {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(REALTIME_LAST_SEQ_STORAGE_KEY) || '{}',
    );
    return typeof parsed === 'object' && parsed !== null ? parsed as LastSeqMap : {};
  } catch {
    return {};
  }
}

function getStoredLastSeq(repositoryId: string): number | undefined {
  const seq = readLastSeqMap()[repositoryId];
  return Number.isFinite(seq) && seq >= 0 ? seq : undefined;
}

function storeLastSeq(repositoryId: string, seq: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(seq) || seq < 0) {
    return;
  }

  const next = readLastSeqMap();
  next[repositoryId] = Math.max(next[repositoryId] ?? 0, seq);
  window.localStorage.setItem(REALTIME_LAST_SEQ_STORAGE_KEY, JSON.stringify(next));
}

function getCounter(eventName: RealtimeEventName): EventCounter {
  realtimeTelemetry.byEvent[eventName] ??= { delivered: 0, rendered: 0 };
  return realtimeTelemetry.byEvent[eventName];
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return sorted[index] ?? 0;
}

function getRealtimeTelemetrySnapshot(): RealtimeTelemetrySnapshot {
  const latencySum = realtimeTelemetry.latencies.reduce(
    (sum, latency) => sum + latency,
    0,
  );
  return {
    delivered: realtimeTelemetry.delivered,
    rendered: realtimeTelemetry.rendered,
    renderRate:
      realtimeTelemetry.delivered === 0
        ? 1
        : realtimeTelemetry.rendered / realtimeTelemetry.delivered,
    avgDeliveryToRenderMs:
      realtimeTelemetry.latencies.length === 0
        ? 0
        : latencySum / realtimeTelemetry.latencies.length,
    p95DeliveryToRenderMs: percentile(realtimeTelemetry.latencies, 0.95),
    byEvent: Object.fromEntries(
      Object.entries(realtimeTelemetry.byEvent).map(([eventName, counter]) => [
        eventName,
        { ...counter },
      ]),
    ),
    recent: [...realtimeTelemetry.recent],
  };
}

function resetRealtimeTelemetry(): void {
  realtimeTelemetry.delivered = 0;
  realtimeTelemetry.rendered = 0;
  realtimeTelemetry.byEvent = {};
  realtimeTelemetry.recent = [];
  realtimeTelemetry.latencies = [];
}

function ensureRealtimeTelemetryApi(): void {
  if (typeof window === 'undefined' || window.__REPO_PULSE_REALTIME_METRICS__) {
    return;
  }

  window.__REPO_PULSE_REALTIME_METRICS__ = {
    snapshot: getRealtimeTelemetrySnapshot,
    reset: resetRealtimeTelemetry,
  };
}

function getNumberField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return undefined;
}

function getStringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getRepositoryRealtimeIdentity(payload?: RepositoryRealtimePayload): {
  key?: string;
  seq?: number;
} {
  if (!payload?.repositoryId || typeof payload.data !== 'object' || payload.data === null) {
    return {};
  }

  const data = payload.data as { id?: unknown; eventId?: unknown; seq?: unknown };
  const seq = getNumberField(data.seq);
  if (seq !== undefined) {
    return {
      key: `${payload.repositoryId}:seq:${seq}`,
      seq,
    };
  }

  const id = getStringField(data.id) ?? getStringField(data.eventId);
  return id ? { key: `${payload.repositoryId}:id:${id}` } : {};
}

function trackRealtimeDelivery(
  eventName: RealtimeEventName,
  payload?: { repositoryId?: string; seq?: number },
  options?: { renderTracked?: boolean },
): RealtimeDeliveryMark {
  ensureRealtimeTelemetryApi();

  const renderTracked = options?.renderTracked ?? true;
  const mark: RealtimeDeliveryMark = {
    deliveryId: ++realtimeDeliveryId,
    eventName,
    repositoryId: payload?.repositoryId,
    seq: payload?.seq,
    receivedAt: performance.now(),
    receivedAtEpoch: Date.now(),
    renderTracked,
  };

  if (renderTracked) {
    realtimeTelemetry.delivered += 1;
    getCounter(eventName).delivered += 1;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('repo-pulse:realtime-delivery', {
        detail: {
          ...mark,
          snapshot: getRealtimeTelemetrySnapshot(),
        },
      }),
    );
  }

  return mark;
}

function afterNextPaint(callback: () => void): void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    globalThis.setTimeout(callback, 0);
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(callback);
  });
}

function rememberRecentRealtimeEvent(event: RealtimeTelemetryEvent): void {
  realtimeTelemetry.recent.push(event);
  if (realtimeTelemetry.recent.length > 50) {
    realtimeTelemetry.recent.splice(0, realtimeTelemetry.recent.length - 50);
  }
}

function recordRealtimeRender(
  eventName: RealtimeEventName,
  startedAt: number,
  delivery?: RealtimeDeliveryMark,
  invalidations: Array<Promise<unknown>> = [],
): number {
  const scheduleMs = performance.now() - startedAt;

  Promise.allSettled(invalidations).finally(() => {
    afterNextPaint(() => {
      const renderedAt = performance.now();
      const deliveryToRenderMs = delivery ? renderedAt - delivery.receivedAt : scheduleMs;

      if (delivery?.renderTracked) {
        realtimeTelemetry.rendered += 1;
        getCounter(eventName).rendered += 1;
        realtimeTelemetry.latencies.push(deliveryToRenderMs);
        if (realtimeTelemetry.latencies.length > 500) {
          realtimeTelemetry.latencies.splice(0, realtimeTelemetry.latencies.length - 500);
        }
      }

      const event: RealtimeTelemetryEvent = {
        deliveryId: delivery?.deliveryId ?? 0,
        eventName,
        repositoryId: delivery?.repositoryId,
        seq: delivery?.seq,
        receivedAtEpoch: delivery?.receivedAtEpoch ?? Date.now(),
        renderedAtEpoch: Date.now(),
        deliveryToRenderMs,
        scheduleMs,
      };
      rememberRecentRealtimeEvent(event);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('repo-pulse:realtime-render', {
            detail: {
              ...event,
              budgetMs: REALTIME_INVALIDATION_BUDGET_MS,
              measuredAt: Date.now(),
              snapshot: getRealtimeTelemetrySnapshot(),
            },
          }),
        );
      }
    });
  });

  return scheduleMs;
}

function getCandidateMessageAt(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as {
    occurredAt?: unknown;
    createdAt?: unknown;
    timestamp?: unknown;
  };
  const candidate = record.occurredAt ?? record.createdAt ?? record.timestamp;
  return typeof candidate === 'string' ? candidate : null;
}

function pickLatestMessageAt(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;

  const leftAt = new Date(left).getTime();
  const rightAt = new Date(right).getTime();
  if (!Number.isFinite(leftAt)) return right;
  if (!Number.isFinite(rightAt)) return left;

  return rightAt > leftAt ? right : left;
}

function getRealtimeMessageAt(payload?: RepositoryRealtimePayload) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload.data)) {
    return payload.data.reduce<string | null>(
      (latest, item) => pickLatestMessageAt(latest, getCandidateMessageAt(item)),
      null,
    ) ?? payload.timestamp ?? null;
  }

  return getCandidateMessageAt(payload.data) ?? payload.timestamp ?? null;
}

function toRepositoryRealtimePayload(payload: EventCreatedPayload): RepositoryRealtimePayload {
  return {
    repositoryId: payload.repositoryId,
    data: {
      id: payload.eventId,
      type: payload.eventType,
      seq: payload.seq,
      createdAt: payload.createdAt,
    },
    timestamp: payload.createdAt,
  };
}

export function invalidateRepositoryRealtimeQueries(
  queryClient: RealtimeQueryClient,
  eventName: 'event:new' | 'events:new' | typeof REALTIME_EVENTS.EVENT_CREATED,
  payload?: RepositoryRealtimePayload,
  delivery?: RealtimeDeliveryMark,
): number {
  const startedAt = performance.now();
  const repositoryId = payload?.repositoryId;
  const messageAt = getRealtimeMessageAt(payload);
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() }),
    queryClient.invalidateQueries({ queryKey: workbenchQueryKeys.chatRepositories() }),
    queryClient.invalidateQueries({
      queryKey: repositoryId
        ? workbenchQueryKeys.conversationMessages(repositoryId)
        : workbenchQueryKeys.conversationMessagesRoot(),
    }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences() }),
  ];

  if (repositoryId) {
    useWorkbenchUnreadStore
      .getState()
      .clearOptimisticReadIfMessageAfterRead(repositoryId, messageAt);
  }

  return recordRealtimeRender(eventName, startedAt, delivery, invalidations);
}

export function invalidateAnalysisRealtimeQueries(
  queryClient: RealtimeQueryClient,
  eventName: 'analysis:completed' | typeof REALTIME_EVENTS.ANALYSIS_COMPLETED = 'analysis:completed',
  delivery?: RealtimeDeliveryMark,
): number {
  const startedAt = performance.now();
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences() }),
  ];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('approval-updated'));
  }

  return recordRealtimeRender(eventName, startedAt, delivery, invalidations);
}

export function invalidateApprovalRealtimeQueries(
  queryClient: RealtimeQueryClient,
  delivery?: RealtimeDeliveryMark,
): number {
  const startedAt = performance.now();
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: approvalKeys.all }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list() }),
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount() }),
  ];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('approval-updated'));
  }

  return recordRealtimeRender(
    REALTIME_EVENTS.APPROVAL_UPDATED,
    startedAt,
    delivery,
    invalidations,
  );
}

function invalidateRepositorySyncQueries(
  queryClient: RealtimeQueryClient,
  eventName: typeof REALTIME_EVENTS.REPOSITORY_SYNCED | typeof REALTIME_EVENTS.REPOSITORY_SYNC_FAILED,
  payload?: RepositorySyncPayload,
  delivery?: RealtimeDeliveryMark,
): number {
  const startedAt = performance.now();
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: repositoryQueryKeys.list() }),
  ];

  if (payload?.repositoryId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: workbenchQueryKeys.conversationMessages(payload.repositoryId),
      }),
    );
  }

  return recordRealtimeRender(eventName, startedAt, delivery, invalidations);
}

function dispatchRepositorySyncEvent(
  eventName: RealtimeEventName,
  payload: RepositorySyncPayload,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent('repo-pulse:repository-sync', {
      detail: {
        eventName,
        ...payload,
      },
    }),
  );
}

export function useRepositoryRealtimeSubscription(repositoryIds?: string | string[]) {
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: isAuthLoading } = useCurrentUserQuery();
  const socketRef = useRef<Socket | null>(null);
  const subscribedRoomsRef = useRef<Set<string>>(new Set());
  const recentRepositoryEventKeysRef = useRef<Map<string, number>>(new Map());
  const connectTimeoutRef = useRef<number | null>(null);

  const socketNamespace = useMemo(() => getSocketUrl('/events'), []);

  const getTargetRepositoryIds = useCallback(() => {
    if (Array.isArray(repositoryIds)) {
      return repositoryIds.filter(Boolean);
    }

    return repositoryIds ? [repositoryIds] : [];
  }, [repositoryIds]);

  const syncRoomSubscriptions = useCallback(() => {
    if (!socketRef.current?.connected) {
      return;
    }

    const nextRooms = new Set(getTargetRepositoryIds());

    for (const id of nextRooms) {
      if (!subscribedRoomsRef.current.has(id)) {
        const sinceSeq = getStoredLastSeq(id);
        socketRef.current.emit(
          'join:repository',
          sinceSeq === undefined ? { repositoryId: id } : { repositoryId: id, sinceSeq },
        );
      }
    }

    for (const id of subscribedRoomsRef.current) {
      if (!nextRooms.has(id)) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
    }

    subscribedRoomsRef.current = nextRooms;
  }, [getTargetRepositoryIds]);

  const hasRecentlySeenRepositoryEvent = useCallback((key?: string) => {
    if (!key) {
      return false;
    }

    const now = Date.now();
    for (const [eventKey, seenAt] of recentRepositoryEventKeysRef.current) {
      if (now - seenAt > 30_000) {
        recentRepositoryEventKeysRef.current.delete(eventKey);
      }
    }

    return recentRepositoryEventKeysRef.current.has(key);
  }, []);

  const rememberRepositoryEvent = useCallback((key?: string) => {
    if (!key) {
      return;
    }

    recentRepositoryEventKeysRef.current.set(key, Date.now());
  }, []);

  const connect = useCallback(() => {
    if (!currentUser || isAuthLoading || socketRef.current || connectTimeoutRef.current !== null) {
      return;
    }

    connectTimeoutRef.current = window.setTimeout(() => {
      connectTimeoutRef.current = null;

      const socket = io(socketNamespace, {
        path: '/socket.io',
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socket.on('connect', () => {
        syncRoomSubscriptions();
      });

      socket.on('connect_error', (error) => {
        console.warn('[socket] connect_error', error.message);
      });

      socket.on('disconnect', (reason) => {
        if (reason !== 'io client disconnect') {
          console.warn('[socket] disconnect', reason);
        }
      });

      socket.on('event:new', (payload: RepositoryRealtimePayload) => {
        const identity = getRepositoryRealtimeIdentity(payload);
        if (hasRecentlySeenRepositoryEvent(identity.key)) {
          return;
        }
        rememberRepositoryEvent(identity.key);
        if (payload.repositoryId && identity.seq !== undefined) {
          storeLastSeq(payload.repositoryId, identity.seq);
        }
        const delivery = trackRealtimeDelivery('event:new', {
          repositoryId: payload.repositoryId,
          seq: identity.seq,
        });
        invalidateRepositoryRealtimeQueries(queryClient, 'event:new', payload, delivery);
      });

      socket.on('events:new', (payload: RepositoryRealtimePayload) => {
        const delivery = trackRealtimeDelivery('events:new', {
          repositoryId: payload.repositoryId,
        });
        invalidateRepositoryRealtimeQueries(queryClient, 'events:new', payload, delivery);
      });

      socket.on(REALTIME_EVENTS.EVENT_CREATED, (payload: EventCreatedPayload) => {
        const eventKey = `${payload.repositoryId}:seq:${payload.seq}`;
        if (hasRecentlySeenRepositoryEvent(eventKey)) {
          storeLastSeq(payload.repositoryId, payload.seq);
          return;
        }
        rememberRepositoryEvent(eventKey);
        storeLastSeq(payload.repositoryId, payload.seq);
        const delivery = trackRealtimeDelivery(REALTIME_EVENTS.EVENT_CREATED, {
          repositoryId: payload.repositoryId,
          seq: payload.seq,
        });
        invalidateRepositoryRealtimeQueries(
          queryClient,
          REALTIME_EVENTS.EVENT_CREATED,
          toRepositoryRealtimePayload(payload),
          delivery,
        );
      });

      socket.on(REALTIME_EVENTS.EVENT_REPLAY_DONE, (payload: EventReplayDonePayload) => {
        storeLastSeq(payload.repositoryId, payload.lastSeq);
      });

      socket.on('analysis:completed', (payload?: { eventId?: string; repositoryId?: string }) => {
        const eventKey = payload?.eventId ? `analysis:${payload.eventId}` : undefined;
        if (hasRecentlySeenRepositoryEvent(eventKey)) {
          return;
        }
        rememberRepositoryEvent(eventKey);
        const delivery = trackRealtimeDelivery('analysis:completed', {
          repositoryId: payload?.repositoryId,
        });
        invalidateAnalysisRealtimeQueries(queryClient, 'analysis:completed', delivery);
      });

      socket.on(REALTIME_EVENTS.ANALYSIS_COMPLETED, (payload: { eventId?: string; repositoryId?: string }) => {
        const eventKey = payload?.eventId ? `analysis:${payload.eventId}` : undefined;
        if (hasRecentlySeenRepositoryEvent(eventKey)) {
          return;
        }
        rememberRepositoryEvent(eventKey);
        const delivery = trackRealtimeDelivery(REALTIME_EVENTS.ANALYSIS_COMPLETED, {
          repositoryId: payload?.repositoryId,
        });
        invalidateAnalysisRealtimeQueries(
          queryClient,
          REALTIME_EVENTS.ANALYSIS_COMPLETED,
          delivery,
        );
      });

      socket.on(REALTIME_EVENTS.APPROVAL_UPDATED, (payload: { repositoryId?: string }) => {
        const delivery = trackRealtimeDelivery(REALTIME_EVENTS.APPROVAL_UPDATED, {
          repositoryId: payload?.repositoryId,
        });
        invalidateApprovalRealtimeQueries(queryClient, delivery);
      });

      socket.on(REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS, (payload: RepositorySyncPayload) => {
        trackRealtimeDelivery(REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS, payload, {
          renderTracked: false,
        });
        dispatchRepositorySyncEvent(REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS, payload);
      });

      socket.on(REALTIME_EVENTS.REPOSITORY_SYNCED, (payload: RepositorySyncPayload) => {
        const delivery = trackRealtimeDelivery(REALTIME_EVENTS.REPOSITORY_SYNCED, payload);
        dispatchRepositorySyncEvent(REALTIME_EVENTS.REPOSITORY_SYNCED, payload);
        invalidateRepositorySyncQueries(
          queryClient,
          REALTIME_EVENTS.REPOSITORY_SYNCED,
          payload,
          delivery,
        );
      });

      socket.on(REALTIME_EVENTS.REPOSITORY_SYNC_FAILED, (payload: RepositorySyncPayload) => {
        const delivery = trackRealtimeDelivery(REALTIME_EVENTS.REPOSITORY_SYNC_FAILED, payload);
        dispatchRepositorySyncEvent(REALTIME_EVENTS.REPOSITORY_SYNC_FAILED, payload);
        invalidateRepositorySyncQueries(
          queryClient,
          REALTIME_EVENTS.REPOSITORY_SYNC_FAILED,
          payload,
          delivery,
        );
      });

      socketRef.current = socket;
    }, 0);
  }, [
    currentUser,
    hasRecentlySeenRepositoryEvent,
    isAuthLoading,
    queryClient,
    rememberRepositoryEvent,
    socketNamespace,
    syncRoomSubscriptions,
  ]);

  const disconnect = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    subscribedRoomsRef.current = new Set();
    recentRepositoryEventKeysRef.current.clear();
  }, []);

  useEffect(() => {
    if (!currentUser || isAuthLoading) {
      disconnect();
      return;
    }

    connect();
    return () => {
      disconnect();
    };
  }, [connect, currentUser, disconnect, isAuthLoading]);

  useEffect(() => {
    syncRoomSubscriptions();

    return () => {
      if (!socketRef.current?.connected) {
        return;
      }

      for (const id of subscribedRoomsRef.current) {
        socketRef.current.emit('leave:repository', { repositoryId: id });
      }
      subscribedRoomsRef.current = new Set();
    };
  }, [syncRoomSubscriptions]);
}
