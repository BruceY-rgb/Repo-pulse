import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PrismaClient } from '@repo-pulse/database';
import {
  AnalysisCompletedPayload,
  AnalysisFailedPayload,
  AnalysisStartedPayload,
  ApprovalUpdatedPayload,
  EventCreatedPayload,
  EventReplayDonePayload,
  REALTIME_EVENTS,
  RepositorySyncFailedPayload,
  RepositorySyncProgressPayload,
  RepositorySyncedPayload,
} from '@repo-pulse/shared';
import { Server, Socket } from 'socket.io';
import { MetricsService } from '../observability/metrics.service';

const REPLAY_BATCH_LIMIT = 200;

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
}

interface UserSocket extends Socket {
  userId?: string;
  email?: string;
  /**
   * 手动维护房间订阅计数，因为 Socket.io 在 disconnect handler 触发时
   * client.rooms 可能已被清空，无法用于准确减计数。
   */
  subCount?: number;
}

export interface RealtimeSocketStats {
  connectedClients: number;
  clients: Array<{
    socketId: string;
    userId?: string;
    email?: string;
    connectedAt: string;
    rooms: string[];
  }>;
  subscriptionsByRepository: Record<string, number>;
}

interface TrackedSocket {
  userId?: string;
  email?: string;
  connectedAt: Date;
  rooms: Set<string>;
}

function createNoopMetricsService(): MetricsService {
  return {
    incrementConnections: () => undefined,
    decrementConnections: () => undefined,
    incrementSubscriptions: () => undefined,
    decrementSubscriptions: () => undefined,
    observeEmitLatency: () => undefined,
  } as unknown as MetricsService;
}

@Injectable()
@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class EventGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventGateway.name);
  private readonly jwtSecret: string;
  private readonly trackedSockets = new Map<string, TrackedSocket>();
  private readonly prisma = new PrismaClient();

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService = createNoopMetricsService(),
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') || 'default-secret';
  }

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: UserSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(
          `Client ${client.id} connected without token (origin=${client.handshake.headers.origin ?? 'unknown'})`,
        );
        client.disconnect();
        return;
      }

      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      client.userId = decoded.sub;
      client.email = decoded.email;
      this.trackedSockets.set(client.id, {
        userId: decoded.sub,
        email: decoded.email,
        connectedAt: new Date(),
        rooms: new Set(),
      });
      this.metricsService.incrementConnections();

      this.logger.log(
        `Client ${client.id} connected as user ${decoded.sub} active=${this.trackedSockets.size}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`Client ${client.id} authentication failed: ${message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: UserSocket) {
    if (client.userId) {
      this.metricsService.decrementConnections();
      const count = client.subCount ?? 0;
      if (count > 0) {
        this.metricsService.decrementSubscriptions(count);
      }
    }
    this.trackedSockets.delete(client.id);
    this.logger.log(
      `Client ${client.id} disconnected active=${this.trackedSockets.size}`,
    );
  }

  @SubscribeMessage('join:repository')
  async handleJoinRepository(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() data: { repositoryId: string; sinceSeq?: number },
  ) {
    const roomName = `repo:${data.repositoryId}`;

    // 1. 先把离线期间漏掉的事件补发到当前 socket（在 join room 之前，
    //    避免新事件抢先到达打乱 seq 顺序）
    if (typeof data.sinceSeq === 'number') {
      await this.replayMissedEvents(client, data.repositoryId, data.sinceSeq);
    }

    // 2. 加入房间，从此刻起接收实时事件
    const alreadyIn = client.rooms.has(roomName);
    client.join(roomName);
    this.trackedSockets.get(client.id)?.rooms.add(roomName);
    if (!alreadyIn) {
      client.subCount = (client.subCount ?? 0) + 1;
      this.metricsService.incrementSubscriptions();
    }
    this.logger.log(
      `Client ${client.id} joined room ${roomName} (user: ${client.userId}${
        typeof data.sinceSeq === 'number' ? `, sinceSeq=${data.sinceSeq}` : ''
      })`,
    );
    return { event: 'joined', room: roomName };
  }

  private async replayMissedEvents(
    client: UserSocket,
    repositoryId: string,
    sinceSeq: number,
  ): Promise<void> {
    try {
      const missed = await this.prisma.event.findMany({
        where: {
          repositoryId,
          seq: { gt: BigInt(sinceSeq) },
        },
        orderBy: { seq: 'asc' },
        take: REPLAY_BATCH_LIMIT + 1,
        select: {
          id: true,
          repositoryId: true,
          type: true,
          seq: true,
          createdAt: true,
        },
      });

      const hasMore = missed.length > REPLAY_BATCH_LIMIT;
      const batch = hasMore ? missed.slice(0, REPLAY_BATCH_LIMIT) : missed;

      for (const event of batch) {
        const payload: EventCreatedPayload = {
          eventId: event.id,
          repositoryId: event.repositoryId,
          eventType: event.type,
          seq: Number(event.seq),
          createdAt: event.createdAt.toISOString(),
        };
        client.emit(REALTIME_EVENTS.EVENT_CREATED, payload);
      }

      const donePayload: EventReplayDonePayload = {
        repositoryId,
        replayed: batch.length,
        hasMore,
        lastSeq:
          batch.length > 0 ? Number(batch[batch.length - 1].seq) : sinceSeq,
      };
      client.emit(REALTIME_EVENTS.EVENT_REPLAY_DONE, donePayload);

      this.logger.log(
        `replay_complete repositoryId=${repositoryId} sinceSeq=${sinceSeq} replayed=${batch.length} hasMore=${hasMore}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(
        `replay_failed repositoryId=${repositoryId} sinceSeq=${sinceSeq} reason=${message}`,
      );
    }
  }

  @SubscribeMessage('leave:repository')
  handleLeaveRepository(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() data: { repositoryId: string },
  ) {
    const roomName = `repo:${data.repositoryId}`;
    const wasIn = client.rooms.has(roomName);
    client.leave(roomName);
    this.trackedSockets.get(client.id)?.rooms.delete(roomName);
    if (wasIn) {
      client.subCount = Math.max(0, (client.subCount ?? 0) - 1);
      this.metricsService.decrementSubscriptions();
    }
    this.logger.log(
      `Client ${client.id} left room ${roomName} (user: ${client.userId})`,
    );
    return { event: 'left', room: roomName };
  }

  broadcastEventCreated(payload: EventCreatedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server.to(roomName).emit(REALTIME_EVENTS.EVENT_CREATED, payload);
    const latency = Date.now() - new Date(payload.createdAt).getTime();
    this.metricsService.observeEmitLatency(REALTIME_EVENTS.EVENT_CREATED, latency);
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.EVENT_CREATED} to room ${roomName} eventId=${payload.eventId}`,
    );
  }

  broadcastNewEvent(repositoryId: string, eventData: unknown) {
    const roomName = `repo:${repositoryId}`;
    this.server.to(roomName).emit('event:new', {
      type: 'event:new',
      repositoryId,
      data: eventData,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Broadcast event:new to room ${roomName}`);
  }

  broadcastNewEvents(repositoryId: string, events: unknown[]) {
    const roomName = `repo:${repositoryId}`;
    this.server.to(roomName).emit('events:new', {
      type: 'events:new',
      repositoryId,
      data: events,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(
      `Broadcast events:new (${events.length} events) to room ${roomName}`,
    );
  }

  broadcastAnalysisCompleted(payload: AnalysisCompletedPayload | string) {
    if (typeof payload === 'string') {
      this.server.emit('analysis:completed', {
        type: 'analysis:completed',
        eventId: payload,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`Broadcast analysis:completed eventId=${payload}`);
      return;
    }

    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.ANALYSIS_COMPLETED, payload);
    const latency = Date.now() - new Date(payload.completedAt).getTime();
    this.metricsService.observeEmitLatency(
      REALTIME_EVENTS.ANALYSIS_COMPLETED,
      latency,
    );
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.ANALYSIS_COMPLETED} to room ${roomName} eventId=${payload.eventId}`,
    );
  }

  broadcastApprovalUpdated(payload: ApprovalUpdatedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server.to(roomName).emit(REALTIME_EVENTS.APPROVAL_UPDATED, payload);
    this.metricsService.observeEmitLatency(REALTIME_EVENTS.APPROVAL_UPDATED, 0);
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.APPROVAL_UPDATED} to room ${roomName} approvalId=${payload.approvalId} status=${payload.status}`,
    );
  }

  broadcastAnalysisStarted(payload: AnalysisStartedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server.to(roomName).emit(REALTIME_EVENTS.ANALYSIS_STARTED, payload);
    this.metricsService.observeEmitLatency(REALTIME_EVENTS.ANALYSIS_STARTED, 0);
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.ANALYSIS_STARTED} to room ${roomName} eventId=${payload.eventId} source=${payload.source}`,
    );
  }

  broadcastAnalysisFailed(payload: AnalysisFailedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server.to(roomName).emit(REALTIME_EVENTS.ANALYSIS_FAILED, payload);
    this.metricsService.observeEmitLatency(REALTIME_EVENTS.ANALYSIS_FAILED, 0);
    this.logger.warn(
      `Broadcast ${REALTIME_EVENTS.ANALYSIS_FAILED} to room ${roomName} eventId=${payload.eventId} reason=${payload.reason}`,
    );
  }

  broadcastRepositorySyncProgress(payload: RepositorySyncProgressPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS, payload);
    this.metricsService.observeEmitLatency(
      REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS,
      0,
    );
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS} to room ${roomName} jobId=${payload.jobId} stage=${payload.stage} progress=${payload.progress}`,
    );
  }

  broadcastRepositorySynced(payload: RepositorySyncedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.REPOSITORY_SYNCED, payload);
    const latency = Date.now() - new Date(payload.syncedAt).getTime();
    this.metricsService.observeEmitLatency(
      REALTIME_EVENTS.REPOSITORY_SYNCED,
      latency,
    );
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.REPOSITORY_SYNCED} to room ${roomName} jobId=${payload.jobId} durationMs=${payload.durationMs}`,
    );
  }

  broadcastRepositorySyncFailed(payload: RepositorySyncFailedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.REPOSITORY_SYNC_FAILED, payload);
    this.metricsService.observeEmitLatency(
      REALTIME_EVENTS.REPOSITORY_SYNC_FAILED,
      0,
    );
    this.logger.warn(
      `Broadcast ${REALTIME_EVENTS.REPOSITORY_SYNC_FAILED} to room ${roomName} jobId=${payload.jobId} reason=${payload.reason}`,
    );
  }

  getRealtimeStats(): RealtimeSocketStats {
    const clients = Array.from(this.trackedSockets.entries()).map(
      ([socketId, socket]) => ({
        socketId,
        userId: socket.userId,
        email: socket.email,
        connectedAt: socket.connectedAt.toISOString(),
        rooms: Array.from(socket.rooms).sort(),
      }),
    );
    const subscriptionsByRepository: Record<string, number> = {};

    for (const client of clients) {
      for (const room of client.rooms) {
        if (!room.startsWith('repo:')) {
          continue;
        }

        const repositoryId = room.slice('repo:'.length);
        subscriptionsByRepository[repositoryId] =
          (subscriptionsByRepository[repositoryId] ?? 0) + 1;
      }
    }

    return {
      connectedClients: clients.length,
      clients,
      subscriptionsByRepository,
    };
  }

  private extractToken(client: UserSocket): string | null {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) {
      return authToken;
    }

    const authorizationHeader =
      client.handshake.headers.authorization as string | undefined;
    if (authorizationHeader?.startsWith('Bearer ')) {
      return authorizationHeader.replace('Bearer ', '');
    }

    const cookieHeader = client.handshake.headers.cookie as string | undefined;
    if (!cookieHeader) {
      return null;
    }

    const tokenPair = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('access_token='));

    if (!tokenPair) {
      return null;
    }

    return decodeURIComponent(tokenPair.split('=').slice(1).join('='));
  }
}
