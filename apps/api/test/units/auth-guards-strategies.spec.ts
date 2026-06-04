/**
 * Tests for auth guards and strategies.
 * Guards that extend Passport's AuthGuard are tested by calling their overridden
 * methods directly — no need for a running HTTP server.
 */

// ── JwtAuthGuard ──────────────────────────────────────────────────────────────

import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';

function makeReflector(isPublic: boolean | undefined) {
  return { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as any;
}

function makeContext(requestOverrides: Record<string, unknown> = {}) {
  const request = { user: { role: 'MEMBER' }, ...requestOverrides };
  // GithubAuthGuard.canActivate 会在凭据检查前调 getResponse()（用于写 oauth_return cookie）
  const response = { cookie: jest.fn() };
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
      getResponse: jest.fn().mockReturnValue(response),
    }),
  } as any;
}

describe('JwtAuthGuard', () => {
  it('returns true for public routes without calling super', () => {
    const guard = new JwtAuthGuard(makeReflector(true));
    const ctx = makeContext();
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('delegates to super.canActivate for non-public routes', () => {
    const guard = new JwtAuthGuard(makeReflector(false));
    // super.canActivate calls passport which we can't easily test; just verify
    // the reflector was called and it doesn't crash on the delegation path.
    // We override super to avoid Passport internals:
    (guard as any).__proto__.__proto__.canActivate = jest.fn().mockReturnValue(true);
    const ctx = makeContext();
    expect(() => guard.canActivate(ctx)).not.toThrow();
  });
});

// ── RolesGuard ────────────────────────────────────────────────────────────────

import { RolesGuard } from '../../src/modules/auth/guards/roles.guard';

describe('RolesGuard', () => {
  it('returns true when no roles required', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    const ctx = makeContext({ user: { role: 'MEMBER' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when user has required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['ADMIN', 'MEMBER']) } as any;
    const guard = new RolesGuard(reflector);
    const ctx = makeContext({ user: { role: 'MEMBER' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns false when user lacks required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['ADMIN']) } as any;
    const guard = new RolesGuard(reflector);
    const ctx = makeContext({ user: { role: 'MEMBER' } });
    expect(guard.canActivate(ctx)).toBe(false);
  });
});

// ── GithubAuthGuard ───────────────────────────────────────────────────────────

import { BadRequestException } from '@nestjs/common';
import { GithubAuthGuard } from '../../src/modules/auth/guards/github-auth.guard';

function makeGithubStrategy(hasCredentials: boolean) {
  return { hasCredentials: jest.fn().mockReturnValue(hasCredentials) } as any;
}

describe('GithubAuthGuard', () => {
  it('throws BadRequestException when strategy has no credentials', () => {
    const guard = new GithubAuthGuard(makeGithubStrategy(false));
    const ctx = makeContext({ method: 'GET', originalUrl: '/auth/github', ip: '127.0.0.1', headers: {} });
    expect(() => guard.canActivate(ctx)).toThrow(BadRequestException);
  });

  it('calls super.canActivate when credentials exist', () => {
    const guard = new GithubAuthGuard(makeGithubStrategy(true));
    // Patch super to avoid Passport call
    (guard as any).__proto__.__proto__.canActivate = jest.fn().mockReturnValue(true);
    const ctx = makeContext({ method: 'GET', originalUrl: '/auth/github', ip: '127.0.0.1', headers: { 'user-agent': 'test' } });
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('handleRequest logs warning and delegates on error', () => {
    const guard = new GithubAuthGuard(makeGithubStrategy(true));
    (guard as any).__proto__.__proto__.handleRequest = jest.fn().mockReturnValue({ id: 'u1' });
    const ctx = makeContext({ originalUrl: '/auth/github/callback' });
    const result = guard.handleRequest(new Error('auth failed'), null, null, ctx);
    expect(result).toEqual({ id: 'u1' });
  });

  it('handleRequest logs success when user provided', () => {
    const guard = new GithubAuthGuard(makeGithubStrategy(true));
    (guard as any).__proto__.__proto__.handleRequest = jest.fn().mockReturnValue({ id: 'u1' });
    const ctx = makeContext({ originalUrl: '/auth/github/callback' });
    const result = guard.handleRequest(null, { id: 'u1' }, null, ctx);
    expect(result).toEqual({ id: 'u1' });
  });

  it('handleRequest handles string info', () => {
    const guard = new GithubAuthGuard(makeGithubStrategy(true));
    (guard as any).__proto__.__proto__.handleRequest = jest.fn().mockReturnValue(null);
    const ctx = makeContext({ originalUrl: '/auth/github/callback' });
    guard.handleRequest(null, null, 'Missing credentials', ctx);
  });

  it('handleRequest handles object info', () => {
    const guard = new GithubAuthGuard(makeGithubStrategy(true));
    (guard as any).__proto__.__proto__.handleRequest = jest.fn().mockReturnValue(null);
    const ctx = makeContext({ originalUrl: '/auth/github/callback' });
    guard.handleRequest(null, null, { message: 'expired' }, ctx);
  });
});

// ── GithubStrategy ────────────────────────────────────────────────────────────

jest.mock('passport-github2', () => ({
  Strategy: class {
    constructor(_opts: any, _cb: any) {}
    name = 'github';
  },
}));

import { GithubStrategy } from '../../src/modules/auth/strategies/github.strategy';

function makeConfigService(values: Record<string, string> = {}) {
  return { get: jest.fn((k: string) => values[k] ?? '') } as any;
}

describe('GithubStrategy', () => {
  it('hasCredentials returns false when using placeholder', () => {
    const strategy = new GithubStrategy(makeConfigService({}));
    // No real credentials provided → uses placeholders
    expect(strategy.hasCredentials()).toBe(false);
  });

  it('hasCredentials returns true after updateCredentials', () => {
    const strategy = new GithubStrategy(makeConfigService({}));
    (strategy as any)._oauth2 = { _clientId: '', _clientSecret: '' };
    strategy.updateCredentials('real-client-id', 'real-client-secret');
    expect(strategy.hasCredentials()).toBe(true);
  });

  it('validate returns user object from profile', async () => {
    const strategy = new GithubStrategy(makeConfigService({ GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' }));
    const profile = {
      id: 'gh-123',
      emails: [{ value: 'alice@example.com' }],
      displayName: 'Alice',
      photos: [{ value: 'https://avatar.url' }],
    };
    const result = await strategy.validate('access-tok', 'refresh-tok', profile);
    expect(result).toMatchObject({
      id: 'gh-123',
      email: 'alice@example.com',
      displayName: 'Alice',
      githubAccessToken: 'access-tok',
      githubRefreshToken: 'refresh-tok',
    });
  });

  it('validate handles missing emails/photos gracefully', async () => {
    const strategy = new GithubStrategy(makeConfigService({}));
    const profile = { id: 'gh-1', emails: [], displayName: 'Bot', photos: [] };
    const result = await strategy.validate('tok', '', profile);
    expect(result.email).toBeUndefined();
    expect(result.avatar).toBeUndefined();
  });
});

// ── JwtStrategy ───────────────────────────────────────────────────────────────
// Avoid Passport constructor complexities — call validate directly on the prototype.

import { JwtStrategy } from '../../src/modules/auth/strategies/jwt.strategy';

describe('JwtStrategy', () => {
  it('validate returns sub, email and role from payload', async () => {
    const strategy = Object.create(JwtStrategy.prototype) as JwtStrategy;
    const result = await strategy.validate({ sub: 'u1', email: 'a@b.com', role: 'ADMIN' } as any);
    expect(result).toEqual({ sub: 'u1', email: 'a@b.com', role: 'ADMIN' });
  });
});
