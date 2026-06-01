import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { performance } from 'perf_hooks';
import type { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import { EventGateway } from '../src/modules/event/event.gateway';
import {
  AnalysisCompletedPayload,
  EventCreatedPayload,
  REALTIME_EVENTS,
} from '@repo-pulse/shared';

const JWT_SECRET = 'websocket-realtime-secret';
const TRANSPORT_BUDGET_MS = 250;

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs = 1500,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

async function waitUntil(
  predicate: () => boolean,
  label: string,
  timeoutMs = 1000,
): Promise<void> {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * percentileValue) - 1,
  );
  return sorted[index] ?? 0;
}

async function connectWithCookie(baseUrl: string): Promise<Socket> {
  const token = jwt.sign(
    { sub: 'user-realtime', email: 'realtime@example.com' },
    JWT_SECRET,
  );
  const socket = io(`${baseUrl}/events`, {
    path: '/socket.io',
    transports: ['websocket'],
    withCredentials: true,
    extraHeaders: {
      cookie: `access_token=${encodeURIComponent(token)}`,
    },
    forceNew: true,
    reconnection: false,
  });

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    }),
    'socket connect',
  );

  return socket;
}

async function measureSocketEvent<T>(
  socket: Socket,
  eventName: string,
  trigger: () => void,
): Promise<{ payload: T; latencyMs: number }> {
  let startedAt = 0;
  const received = withTimeout(
    new Promise<{ payload: T; latencyMs: number }>((resolve) => {
      socket.once(eventName, (payload: T) => {
        resolve({
          payload,
          latencyMs: performance.now() - startedAt,
        });
      });
    }),
    eventName,
  );

  startedAt = performance.now();
  trigger();
  return received;
}

describe('WebSocket realtime transport (e2e)', () => {
  let app: INestApplication;
  let gateway: EventGateway;
  let baseUrl: string;
  let socket: Socket | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        EventGateway,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'JWT_SECRET') return JWT_SECRET;
              if (key === 'FRONTEND_URL') return 'http://localhost:5173';
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0, '127.0.0.1');
    gateway = app.get(EventGateway);

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    socket?.disconnect();
    socket = undefined;
  });

  afterAll(async () => {
    await app.close();
  });

  it('tracks connected sockets, repository subscriptions, and realtime latency', async () => {
    socket = await connectWithCookie(baseUrl);

    await waitUntil(
      () => gateway.getRealtimeStats().connectedClients === 1,
      'gateway connection stats',
    );

    expect(gateway.getRealtimeStats()).toMatchObject({
      connectedClients: 1,
      clients: [
        expect.objectContaining({
          userId: 'user-realtime',
          email: 'realtime@example.com',
        }),
      ],
    });

    socket.emit('join:repository', { repositoryId: 'repo-realtime' });
    await waitUntil(
      () =>
        gateway.getRealtimeStats().subscriptionsByRepository['repo-realtime'] ===
        1,
      'repository room subscription stats',
    );

    const eventLatencies: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const result = await measureSocketEvent<{
        type: string;
        repositoryId: string;
      }>(socket, 'event:new', () => {
        gateway.broadcastNewEvent('repo-realtime', {
          id: `event-${index}`,
          type: 'PUSH',
        });
      });

      expect(result.payload).toMatchObject({
        type: 'event:new',
        repositoryId: 'repo-realtime',
      });
      eventLatencies.push(result.latencyMs);
    }

    const batchResult = await measureSocketEvent<{
      type: string;
      repositoryId: string;
      data: unknown[];
    }>(socket, 'events:new', () => {
      gateway.broadcastNewEvents('repo-realtime', [
        { id: 'batch-1' },
        { id: 'batch-2' },
      ]);
    });

    expect(batchResult.payload).toMatchObject({
      type: 'events:new',
      repositoryId: 'repo-realtime',
    });
    expect(batchResult.payload.data).toHaveLength(2);

    const createdResult = await measureSocketEvent<EventCreatedPayload>(
      socket,
      REALTIME_EVENTS.EVENT_CREATED,
      () => {
        gateway.broadcastEventCreated({
          eventId: 'event-created-1',
          repositoryId: 'repo-realtime',
          eventType: 'PUSH',
          seq: 1,
          createdAt: new Date().toISOString(),
        });
      },
    );

    expect(createdResult.payload).toMatchObject({
      eventId: 'event-created-1',
      repositoryId: 'repo-realtime',
      eventType: 'PUSH',
      seq: 1,
    });

    const analysisResult = await measureSocketEvent<{
      type: string;
      eventId: string;
    }>(socket, 'analysis:completed', () => {
      gateway.broadcastAnalysisCompleted('analysis-event-1');
    });

    expect(analysisResult.payload).toMatchObject({
      type: 'analysis:completed',
      eventId: 'analysis-event-1',
    });

    const analysisCompletedResult = await measureSocketEvent<AnalysisCompletedPayload>(
      socket,
      REALTIME_EVENTS.ANALYSIS_COMPLETED,
      () => {
        gateway.broadcastAnalysisCompleted({
          eventId: 'analysis-event-2',
          repositoryId: 'repo-realtime',
          completedAt: new Date().toISOString(),
        });
      },
    );

    expect(analysisCompletedResult.payload).toMatchObject({
      eventId: 'analysis-event-2',
      repositoryId: 'repo-realtime',
    });

    const p95EventLatency = percentile(eventLatencies, 0.95);
    const maxEventLatency = Math.max(...eventLatencies);
    console.info(
      `[websocket-realtime] event:new p95=${p95EventLatency.toFixed(
        2,
      )}ms max=${maxEventLatency.toFixed(2)}ms events:new=${batchResult.latencyMs.toFixed(
        2,
      )}ms event.created=${createdResult.latencyMs.toFixed(
        2,
      )}ms analysis:completed=${analysisResult.latencyMs.toFixed(
        2,
      )}ms analysis.completed=${analysisCompletedResult.latencyMs.toFixed(
        2,
      )}ms budget=${TRANSPORT_BUDGET_MS}ms`,
    );

    expect(p95EventLatency).toBeLessThanOrEqual(TRANSPORT_BUDGET_MS);
    expect(batchResult.latencyMs).toBeLessThanOrEqual(TRANSPORT_BUDGET_MS);
    expect(createdResult.latencyMs).toBeLessThanOrEqual(TRANSPORT_BUDGET_MS);
    expect(analysisResult.latencyMs).toBeLessThanOrEqual(TRANSPORT_BUDGET_MS);
    expect(analysisCompletedResult.latencyMs).toBeLessThanOrEqual(TRANSPORT_BUDGET_MS);

    socket.emit('leave:repository', { repositoryId: 'repo-realtime' });
    await waitUntil(
      () =>
        gateway.getRealtimeStats().subscriptionsByRepository['repo-realtime'] ===
        undefined,
      'repository room leave stats',
    );

    socket.disconnect();
    await waitUntil(
      () => gateway.getRealtimeStats().connectedClients === 0,
      'gateway disconnect stats',
    );
  });
});
