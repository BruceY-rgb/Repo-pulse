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
  EventCreatedPayload,
  EventReplayDonePayload,
  REALTIME_EVENTS,
  RepositorySyncFailedPayload,
  RepositorySyncProgressPayload,
  RepositorySyncedPayload,
} from '@repo-pulse/shared';
import { Server, Socket } from 'socket.io';

const REPLAY_BATCH_LIMIT = 200;

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
}

interface UserSocket extends Socket {
  userId?: string;
  email?: string;
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
  private readonly prisma = new PrismaClient();

  constructor(private readonly configService: ConfigService) {
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

      this.logger.log(`Client ${client.id} connected as user ${decoded.sub}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`Client ${client.id} authentication failed: ${message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: UserSocket) {
    this.logger.log(`Client ${client.id} disconnected`);
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
    client.join(roomName);
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
    client.leave(roomName);
    this.logger.log(
      `Client ${client.id} left room ${roomName} (user: ${client.userId})`,
    );
    return { event: 'left', room: roomName };
  }

  broadcastEventCreated(payload: EventCreatedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server.to(roomName).emit(REALTIME_EVENTS.EVENT_CREATED, payload);
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.EVENT_CREATED} to room ${roomName} eventId=${payload.eventId}`,
    );
  }

  broadcastAnalysisCompleted(payload: AnalysisCompletedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.ANALYSIS_COMPLETED, payload);
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.ANALYSIS_COMPLETED} to room ${roomName} eventId=${payload.eventId}`,
    );
  }

  broadcastRepositorySyncProgress(payload: RepositorySyncProgressPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS, payload);
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.REPOSITORY_SYNC_PROGRESS} to room ${roomName} jobId=${payload.jobId} stage=${payload.stage} progress=${payload.progress}`,
    );
  }

  broadcastRepositorySynced(payload: RepositorySyncedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.REPOSITORY_SYNCED, payload);
    this.logger.log(
      `Broadcast ${REALTIME_EVENTS.REPOSITORY_SYNCED} to room ${roomName} jobId=${payload.jobId} durationMs=${payload.durationMs}`,
    );
  }

  broadcastRepositorySyncFailed(payload: RepositorySyncFailedPayload) {
    const roomName = `repo:${payload.repositoryId}`;
    this.server
      .to(roomName)
      .emit(REALTIME_EVENTS.REPOSITORY_SYNC_FAILED, payload);
    this.logger.warn(
      `Broadcast ${REALTIME_EVENTS.REPOSITORY_SYNC_FAILED} to room ${roomName} jobId=${payload.jobId} reason=${payload.reason}`,
    );
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
