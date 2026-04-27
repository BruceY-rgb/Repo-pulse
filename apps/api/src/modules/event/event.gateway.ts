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
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      client.userId = decoded.sub;
      client.email = decoded.email;

      this.logger.log(`Client ${client.id} connected as user ${decoded.sub}`);
    } catch {
      this.logger.warn(`Client ${client.id} authentication failed`);
      client.disconnect();
    }
  }

  handleDisconnect(client: UserSocket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join:repository')
  handleJoinRepository(
    @ConnectedSocket() client: UserSocket,
    @MessageBody() data: { repositoryId: string },
  ) {
    const roomName = `repo:${data.repositoryId}`;
    client.join(roomName);
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