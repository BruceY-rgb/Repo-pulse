jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  prisma: {},
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../../src/modules/auth/auth.controller';

function makeAuthService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    validateUser: jest.fn().mockResolvedValue({ id: 'u1', email: 'alice@example.com', name: 'Alice', role: 'MEMBER' }),
    generateTokens: jest.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }),
    handleGithubEnvTokenAuth: jest.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }),
    refreshTokens: jest.fn().mockResolvedValue({ accessToken: 'acc2', refreshToken: 'ref2' }),
    handleGithubAuth: jest.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }),
    ...overrides,
  } as any;
}

function makeUserService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findById: jest.fn().mockResolvedValue({ id: 'u1', email: 'alice@example.com' }),
    ...overrides,
  } as any;
}

function makeGithubStrategy(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    updateCredentials: jest.fn(),
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
  let githubStrategy: ReturnType<typeof makeGithubStrategy>;
  let configService: ReturnType<typeof makeConfigService>;

  beforeEach(() => {
    authService = makeAuthService();
    userService = makeUserService();
    githubStrategy = makeGithubStrategy();
    configService = makeConfigService({ FRONTEND_URL: 'http://localhost:5173' });
    controller = new AuthController(authService, userService, githubStrategy, configService);
  });

  // ── login ─────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('sets token cookies and returns user info', async () => {
      const res = makeRes();
      const result = await controller.login({ email: 'alice@example.com', password: 'pw' } as any, res);
      expect(authService.validateUser).toHaveBeenCalledWith('alice@example.com', 'pw');
      expect(res.cookie).toHaveBeenCalledWith('access_token', 'acc', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'ref', expect.any(Object));
      expect(result).toMatchObject({ userId: 'u1', email: 'alice@example.com' });
    });
  });

  // ── desktopGithubLogin ────────────────────────────────────────────────────
  describe('desktopGithubLogin', () => {
    it('calls handleGithubEnvTokenAuth and sets cookies', async () => {
      const res = makeRes();
      const result = await controller.desktopGithubLogin(res);
      expect(authService.handleGithubEnvTokenAuth).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('message');
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

  // ── getGithubOAuthRuntimeConfig ───────────────────────────────────────────
  describe('getGithubOAuthRuntimeConfig', () => {
    it('returns callbackUrl from config', () => {
      configService.get.mockReturnValue('https://api.example.com/auth/github/callback');
      const result = controller.getGithubOAuthRuntimeConfig();
      expect(result).toHaveProperty('callbackUrl', 'https://api.example.com/auth/github/callback');
    });
  });

  // ── configureGithubOAuth ──────────────────────────────────────────────────
  describe('configureGithubOAuth', () => {
    it('throws when clientId or clientSecret missing', () => {
      expect(() => controller.configureGithubOAuth({ clientId: '', clientSecret: 'sec' }))
        .toThrow(UnauthorizedException);
      expect(() => controller.configureGithubOAuth({ clientId: 'id', clientSecret: '' }))
        .toThrow(UnauthorizedException);
    });

    it('calls updateCredentials and returns message', () => {
      const result = controller.configureGithubOAuth({ clientId: 'client-id', clientSecret: 'client-sec' });
      expect(githubStrategy.updateCredentials).toHaveBeenCalledWith('client-id', 'client-sec');
      expect(result).toHaveProperty('message');
    });
  });

  // ── githubCallback ────────────────────────────────────────────────────────
  describe('githubCallback', () => {
    it('handles oauth callback: sets cookies and redirects', async () => {
      const profile = { id: 'gh-1', email: 'a@b.com', displayName: 'Alice', avatar: '', githubAccessToken: 'gat', githubRefreshToken: 'grt' };
      const req = makeReq({ user: profile, query: { code: 'abc' } });
      const res = makeRes();
      await controller.githubCallback(req, res);
      expect(authService.handleGithubAuth).toHaveBeenCalledWith(profile);
      expect(res.cookie).toHaveBeenCalledTimes(2);
      expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/auth/callback'));
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

  // ── githubAuth ────────────────────────────────────────────────────────────
  it('githubAuth method exists (passport handles redirect)', () => {
    expect(() => controller.githubAuth()).not.toThrow();
  });
});
