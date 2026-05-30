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
import { Server, Socket } from 'socket.io';

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
}

interface UserSocket extends Socket {
  userId?: string;
  email?: string;
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
      this.trackedSockets.set(client.id, {
        userId: decoded.sub,
        email: decoded.email,
        connectedAt: new Date(),
        rooms: new Set(),
      });

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
    this.trackedSockets.delete(client.id);
    this.logger.log(
      `Client ${client.id} disconnected active=${this.trackedSockets.size}`,
    );
  }

  @SubscribeMessage('join:repository')
  handleJoinRepository(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() data: { repositoryId: string },
  ) {
    const roomName = `repo:${data.repositoryId}`;
    client.join(roomName);
    this.trackedSockets.get(client.id)?.rooms.add(roomName);
    this.logger.log(
      `Client ${client.id} joined room ${roomName} (user: ${client.userId})`,
    );
    return { event: 'joined', room: roomName };
  }

  @SubscribeMessage('leave:repository')
  handleLeaveRepository(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() data: { repositoryId: string },
  ) {
    const roomName = `repo:${data.repositoryId}`;
    client.leave(roomName);
    this.trackedSockets.get(client.id)?.rooms.delete(roomName);
    this.logger.log(
      `Client ${client.id} left room ${roomName} (user: ${client.userId})`,
    );
    return { event: 'left', room: roomName };
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

  broadcastAnalysisCompleted(eventId: string) {
    this.server.emit('analysis:completed', {
      type: 'analysis:completed',
      eventId,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Broadcast analysis:completed eventId=${eventId}`);
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
