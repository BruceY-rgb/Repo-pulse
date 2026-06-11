jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  prisma: {},
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../../src/modules/auth/auth.controller';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function makeAuthService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    validateUser: jest.fn().mockResolvedValue({ id: 'u1', email: 'alice@example.com', name: 'Alice', role: 'MEMBER' }),
    generateTokens: jest.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }),
    register: jest.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref', userId: 'u1', email: 'alice@example.com', name: 'Alice', role: 'ADMIN' }),
    getBootstrapStatus: jest.fn().mockResolvedValue({ required: false }),
    refreshTokens: jest.fn().mockResolvedValue({ accessToken: 'acc2', refreshToken: 'ref2' }),
    verifyToken: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as any;
}

function makeUserService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'alice@example.com' }),
    ...overrides,
  } as any;
}

function makeConfigService(values: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string) => values[key] ?? ''),
  } as any;
}

function makeRes() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as any;
}

function makeReq(overrides: Partial<Record<string, any>> = {}) {
  return {
    cookies: {},
    user: null,
    query: {},
    ...overrides,
  } as any;
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof makeAuthService>;
  let userService: ReturnType<typeof makeUserService>;

  beforeEach(() => {
    authService = makeAuthService();
    userService = makeUserService();
    controller = new AuthController(authService, userService, makeConfigService());
  });

  // ── login ─────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('validates credentials, sets token cookies and returns user info', async () => {
      const res = makeRes();
      const result = await controller.login({ email: 'alice@example.com', password: 'pw' }, res);
      expect(authService.validateUser).toHaveBeenCalledWith('alice@example.com', 'pw');
      expect(res.cookie).toHaveBeenCalledWith('access_token', 'acc', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'ref', expect.any(Object));
      expect(result).toMatchObject({ userId: 'u1', email: 'alice@example.com' });
    });

    it('propagates UnauthorizedException from validateUser', async () => {
      authService.validateUser.mockRejectedValue(new UnauthorizedException());
      const res = makeRes();
      await expect(controller.login({ email: 'a@b.com', password: 'bad' }, res)).rejects.toThrow(UnauthorizedException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  // ── register ──────────────────────────────────────────────────────────────
  describe('register', () => {
    it('registers, sets cookies and returns user info with role', async () => {
      const res = makeRes();
      const result = await controller.register(
        { email: 'alice@example.com', name: 'Alice', password: 'password123' },
        res,
      );
      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'alice@example.com', name: 'Alice' }),
      );
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ userId: 'u1', role: 'ADMIN' });
      expect(result).not.toHaveProperty('accessToken');
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('bootstrapStatus', () => {
    it('returns bootstrap status', async () => {
      await expect(controller.bootstrapStatus()).resolves.toMatchObject({ required: false });
    });
  });

  // ── cookie lifetime ───────────────────────────────────────────────────────
  describe('token cookie lifetime', () => {
    it('defaults to 7d access / 30d refresh when env is not set', async () => {
      const res = makeRes();
      await controller.login({ email: 'a@b.com', password: 'pw' }, res);
      expect(res.cookie).toHaveBeenCalledWith('access_token', 'acc', expect.objectContaining({ maxAge: SEVEN_DAYS_MS, httpOnly: true }));
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'ref', expect.objectContaining({ maxAge: THIRTY_DAYS_MS, httpOnly: true }));
    });

    it('derives cookie maxAge from JWT_EXPIRATION / JWT_REFRESH_EXPIRATION', async () => {
      const configured = new AuthController(
        authService,
        userService,
        makeConfigService({ JWT_EXPIRATION: '12h', JWT_REFRESH_EXPIRATION: '90d' }),
      );
      const res = makeRes();
      await configured.login({ email: 'a@b.com', password: 'pw' }, res);
      expect(res.cookie).toHaveBeenCalledWith('access_token', 'acc', expect.objectContaining({ maxAge: 12 * 60 * 60 * 1000 }));
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'ref', expect.objectContaining({ maxAge: 90 * 24 * 60 * 60 * 1000 }));
    });

    it('falls back to defaults on malformed duration strings', async () => {
      const configured = new AuthController(
        authService,
        userService,
        makeConfigService({ JWT_EXPIRATION: 'soon', JWT_REFRESH_EXPIRATION: '1 month' }),
      );
      const res = makeRes();
      await configured.login({ email: 'a@b.com', password: 'pw' }, res);
      expect(res.cookie).toHaveBeenCalledWith('access_token', 'acc', expect.objectContaining({ maxAge: SEVEN_DAYS_MS }));
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'ref', expect.objectContaining({ maxAge: THIRTY_DAYS_MS }));
    });
  });

  // ── refresh ───────────────────────────────────────────────────────────────
  describe('refresh', () => {
    it('throws UnauthorizedException when no refresh_token cookie', async () => {
      const req = makeReq({ cookies: {} });
      const res = makeRes();
      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
    });

    it('refreshes tokens and sets new cookies', async () => {
      const req = makeReq({ cookies: { refresh_token: 'old-ref' } });
      const res = makeRes();
      const result = await controller.refresh(req, res);
      expect(authService.refreshTokens).toHaveBeenCalledWith('old-ref');
      expect(res.cookie).toHaveBeenCalledWith('access_token', 'acc2', expect.any(Object));
      expect(result).toHaveProperty('message');
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────
  describe('logout', () => {
    it('clears both cookies', async () => {
      const res = makeRes();
      const result = await controller.logout(res);
      expect(res.clearCookie).toHaveBeenCalledWith('access_token', { path: '/' });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', { path: '/' });
      expect(result).toHaveProperty('message');
    });
  });

  // ── session（同设备登录态保持的核心链路）────────────────────────────────────
  describe('session', () => {
    it('returns user when access token is valid', async () => {
      authService.verifyToken.mockResolvedValueOnce({ sub: 'u1', email: 'a@b.com', role: 'MEMBER' });
      const req = makeReq({ cookies: { access_token: 'good' } });
      const res = makeRes();
      const result = await controller.session(req, res);
      expect(userService.findById).toHaveBeenCalledWith('u1');
      expect(result).toMatchObject({ id: 'u1' });
    });

    it('returns null when no tokens are present', async () => {
      const req = makeReq({ cookies: {} });
      const res = makeRes();
      await expect(controller.session(req, res)).resolves.toBeNull();
    });

    it('silently re-mints tokens from a valid refresh token when access token expired', async () => {
      authService.verifyToken
        .mockResolvedValueOnce(null) // access token 失效
        .mockResolvedValueOnce({ sub: 'u1', email: 'a@b.com', role: 'MEMBER' }); // refresh token 有效
      const req = makeReq({ cookies: { access_token: 'expired', refresh_token: 'valid' } });
      const res = makeRes();
      const result = await controller.session(req, res);
      expect(authService.generateTokens).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com', role: 'MEMBER' });
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toMatchObject({ id: 'u1' });
    });

    it('clears cookies and returns null when refresh token is invalid', async () => {
      authService.verifyToken.mockResolvedValue(null);
      const req = makeReq({ cookies: { access_token: 'expired', refresh_token: 'bad' } });
      const res = makeRes();
      const result = await controller.session(req, res);
      expect(res.clearCookie).toHaveBeenCalledWith('access_token', { path: '/' });
      expect(result).toBeNull();
    });
  });

  // ── me ────────────────────────────────────────────────────────────────────
  describe('me', () => {
    it('delegates to userService.findById', async () => {
      const result = await controller.me({ sub: 'u1' });
      expect(userService.findById).toHaveBeenCalledWith('u1');
      expect(result).toMatchObject({ id: 'u1' });
    });
  });
});
