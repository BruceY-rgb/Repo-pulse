import * as jwt from 'jsonwebtoken';
import { EventGateway } from '../../src/modules/event/event.gateway';

jest.mock('@nestjs/websockets', () => ({
  WebSocketGateway: () => () => {},
  WebSocketServer: () => () => {},
  SubscribeMessage: () => () => {},
  ConnectedSocket: () => () => {},
  MessageBody: () => () => {},
  OnGatewayInit: class {},
  OnGatewayConnection: class {},
  OnGatewayDisconnect: class {},
}));

function makeGateway(jwtSecret = 'test-secret') {
  const configService = { get: jest.fn().mockReturnValue(jwtSecret) };
  const gw = new EventGateway(configService as any);
  (gw as any).server = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
  };
  return gw;
}

function makeClient(overrides: Partial<{
  id: string;
  auth: Record<string, string>;
  headers: Record<string, string>;
}> = {}) {
  return {
    id: overrides.id ?? 'socket-1',
    handshake: {
      auth: overrides.auth ?? {},
      headers: overrides.headers ?? {},
    },
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    userId: undefined as string | undefined,
    email: undefined as string | undefined,
  };
}

describe('EventGateway', () => {
  const SECRET = 'test-secret';
  let gateway: EventGateway;

  beforeEach(() => {
    gateway = makeGateway(SECRET);
  });

  // ── afterInit ─────────────────────────────────────────────────────────────
  it('afterInit does not throw', () => {
    expect(() => gateway.afterInit()).not.toThrow();
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────
  it('handleDisconnect logs and does not throw', () => {
    const client = makeClient();
    expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
  });

  // ── handleConnection ──────────────────────────────────────────────────────
  describe('handleConnection', () => {
    it('disconnects client with no token', async () => {
      const client = makeClient({ headers: {}, auth: {} });
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('sets userId/email from valid JWT in auth.token', async () => {
      const token = jwt.sign({ sub: 'u1', email: 'alice@example.com' }, SECRET);
      const client = makeClient({ auth: { token } });
      await gateway.handleConnection(client as any);
      expect(client.userId).toBe('u1');
      expect(client.email).toBe('alice@example.com');
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(gateway.getRealtimeStats()).toMatchObject({
        connectedClients: 1,
        clients: [
          expect.objectContaining({
            socketId: 'socket-1',
            userId: 'u1',
            email: 'alice@example.com',
          }),
        ],
      });
    });

    it('sets userId from Bearer token in Authorization header', async () => {
      const token = jwt.sign({ sub: 'u2', email: 'bob@example.com' }, SECRET);
      const client = makeClient({ headers: { authorization: `Bearer ${token}` } });
      await gateway.handleConnection(client as any);
      expect(client.userId).toBe('u2');
    });

    it('sets userId from access_token cookie', async () => {
      const token = jwt.sign({ sub: 'u3', email: 'carol@example.com' }, SECRET);
      const client = makeClient({ headers: { cookie: `other=x; access_token=${encodeURIComponent(token)}` } });
      await gateway.handleConnection(client as any);
      expect(client.userId).toBe('u3');
    });

    it('disconnects when JWT is invalid', async () => {
      const client = makeClient({ auth: { token: 'bad.token.value' } });
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects when JWT is signed with wrong secret', async () => {
      const token = jwt.sign({ sub: 'u1', email: 'alice@example.com' }, 'wrong-secret');
      const client = makeClient({ auth: { token } });
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects when cookie present but no access_token', async () => {
      const client = makeClient({ headers: { cookie: 'session=abc; other=def' } });
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('handles access_token cookie with = in value', async () => {
      const token = jwt.sign({ sub: 'u4', email: 'dave@example.com' }, SECRET);
      const encoded = encodeURIComponent(token);
      // encoded token contains = signs
      const client = makeClient({ headers: { cookie: `access_token=${encoded}` } });
      await gateway.handleConnection(client as any);
      expect(client.userId).toBe('u4');
    });
  });

  // ── handleJoinRepository ──────────────────────────────────────────────────
  describe('handleJoinRepository', () => {
    it('joins the correct room and returns event', async () => {
      const client = makeClient();
      const result = await gateway.handleJoinRepository(client as any, { repositoryId: 'r1' });
      expect(client.join).toHaveBeenCalledWith('repo:r1');
      expect(result).toEqual({ event: 'joined', room: 'repo:r1' });
    });
  });

  // ── handleLeaveRepository ─────────────────────────────────────────────────
  describe('handleLeaveRepository', () => {
    it('leaves the correct room and returns event', () => {
      const client = makeClient();
      const result = gateway.handleLeaveRepository(client as any, { repositoryId: 'r2' });
      expect(client.leave).toHaveBeenCalledWith('repo:r2');
      expect(result).toEqual({ event: 'left', room: 'repo:r2' });
    });
  });

  describe('socket monitoring', () => {
    it('tracks repository room subscriptions and removes disconnected sockets', async () => {
      const token = jwt.sign({ sub: 'u1', email: 'alice@example.com' }, SECRET);
      const client = makeClient({ auth: { token } });

      await gateway.handleConnection(client as any);
      await gateway.handleJoinRepository(client as any, { repositoryId: 'r1' });

      expect(gateway.getRealtimeStats()).toMatchObject({
        connectedClients: 1,
        subscriptionsByRepository: {
          r1: 1,
        },
      });
      expect(gateway.getRealtimeStats().clients[0]?.rooms).toEqual(['repo:r1']);

      gateway.handleLeaveRepository(client as any, { repositoryId: 'r1' });
      expect(gateway.getRealtimeStats().subscriptionsByRepository).toEqual({});

      gateway.handleDisconnect(client as any);
      expect(gateway.getRealtimeStats().connectedClients).toBe(0);
    });
  });

  // ── broadcastNewEvent ─────────────────────────────────────────────────────
  describe('broadcastNewEvent', () => {
    it('emits event:new to the repo room', () => {
      const serverMock = (gateway as any).server;
      gateway.broadcastNewEvent('r1', { type: 'PUSH' });
      expect(serverMock.to).toHaveBeenCalledWith('repo:r1');
      expect(serverMock.emit).toHaveBeenCalledWith(
        'event:new',
        expect.objectContaining({ type: 'event:new', repositoryId: 'r1' }),
      );
    });
  });

  describe('broadcastNewEvents', () => {
    it('emits events:new to the repo room', () => {
      const serverMock = (gateway as any).server;
      gateway.broadcastNewEvents('r1', [{ type: 'PUSH' }, { type: 'PR_OPENED' }]);
      expect(serverMock.to).toHaveBeenCalledWith('repo:r1');
      expect(serverMock.emit).toHaveBeenCalledWith(
        'events:new',
        expect.objectContaining({
          type: 'events:new',
          repositoryId: 'r1',
          data: [{ type: 'PUSH' }, { type: 'PR_OPENED' }],
        }),
      );
    });
  });

  // ── broadcastAnalysisCompleted ────────────────────────────────────────────
  describe('broadcastAnalysisCompleted', () => {
    it('emits analysis:completed globally', () => {
      const serverMock = (gateway as any).server;
      gateway.broadcastAnalysisCompleted('e1');
      expect(serverMock.emit).toHaveBeenCalledWith(
        'analysis:completed',
        expect.objectContaining({ type: 'analysis:completed', eventId: 'e1' }),
      );
    });
  });

  // ── constructor fallback ──────────────────────────────────────────────────
  it('uses default-secret when JWT_SECRET not configured', () => {
    const configNoSecret = { get: jest.fn().mockReturnValue(undefined) };
    const gw = new EventGateway(configNoSecret as any);
    expect((gw as any).jwtSecret).toBe('default-secret');
  });
});
