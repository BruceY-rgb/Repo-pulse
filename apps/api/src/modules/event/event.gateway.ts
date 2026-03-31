import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/events',
})
export class EventGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventGateway.name);
  private readonly jwtSecret: string;

  constructor(private configService: ConfigService) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') || 'default-secret';
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
      (client as any).userId = decoded.sub;
      (client as any).email = decoded.email;

      this.logger.log(`Client ${client.id} connected as user ${decoded.sub}`);
    } catch (error) {
      this.logger.warn(`Client ${client.id} authentication failed`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('join:repository')
  handleJoinRepository(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { repositoryId: string },
  ) {
    const { repositoryId } = data;
    const roomName = `repo:${repositoryId}`;

    client.join(roomName);
    this.logger.log(
      `Client ${client.id} joined room ${roomName} (user: ${(client as any).userId})`,
    );

    return { event: 'joined', room: roomName };
  }

  @SubscribeMessage('leave:repository')
  handleLeaveRepository(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { repositoryId: string },
  ) {
    const { repositoryId } = data;
    const roomName = `repo:${repositoryId}`;

    client.leave(roomName);
    this.logger.log(
      `Client ${client.id} left room ${roomName} (user: ${(client as any).userId})`,
    );

    return { event: 'left', room: roomName };
  }

  /**
   * 广播新事件到指定仓库的房间
   * 由 EventProcessor 在处理完 Webhook 事件后调用
   */
  broadcastNewEvent(repositoryId: string, eventData: unknown) {
    const roomName = `repo:${repositoryId}`;

    this.server.to(roomName).emit('event:new', {
      type: 'event:new',
      data: eventData,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Broadcast event:new to room ${roomName}`,
    );
  }

  /**
   * 广播新事件到所有订阅者的房间
   * 批量广播接口
   */
  broadcastNewEvents(repositoryId: string, events: unknown[]) {
    const roomName = `repo:${repositoryId}`;

    this.server.to(roomName).emit('events:new', {
      type: 'events:new',
      data: events,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `Broadcast events:new (${events.length} events) to room ${roomName}`,
    );
  }
}
