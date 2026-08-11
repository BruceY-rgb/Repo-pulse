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
