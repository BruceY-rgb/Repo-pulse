jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  prisma: {},
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/modules/auth/auth.service';

jest.mock('bcrypt');
jest.mock('axios');

const mockBcryptCompare = bcrypt.compare as jest.Mock;

function makeUser(overrides: object = {}) {
  return {
    id: 'u1',
    email: 'alice@example.com',
    name: 'Alice',
    avatar: null,
    passwordHash: 'hashed',
    githubId: null,
    githubAccessToken: null,
    githubRefreshToken: null,
    role: 'MEMBER',
    preferences: {},
    aiProvider: null,
    aiApiKey: null,
    aiBaseUrl: null,
    aiModel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeService(overrides: Partial<{
  findByEmail: jest.Mock;
  findByGithubId: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  signAsync: jest.Mock;
  verifyAsync: jest.Mock;
  configGet: jest.Mock;
  syncUserRepos: jest.Mock;
  verifyCode: jest.Mock;
}> = {}) {
  const findByEmail = overrides.findByEmail ?? jest.fn().mockResolvedValue(null);
  const findByGithubId = overrides.findByGithubId ?? jest.fn().mockResolvedValue(null);
  const create = overrides.create ?? jest.fn().mockResolvedValue(makeUser());
  const update = overrides.update ?? jest.fn().mockResolvedValue(makeUser());
  const signAsync = overrides.signAsync ?? jest.fn().mockResolvedValue('token-xxx');
  const verifyAsync = overrides.verifyAsync ?? jest.fn();
  const configGet = overrides.configGet ?? jest.fn().mockReturnValue(undefined);
  const syncUserRepos = overrides.syncUserRepos ?? jest.fn().mockResolvedValue(undefined);
  const verifyCode = overrides.verifyCode ?? jest.fn().mockResolvedValue(undefined);

  const jwtService = { signAsync, verifyAsync } as any;
  const configService = { get: configGet } as any;
  const userService = { findByEmail, findByGithubId, create, update } as any;
  const syncService = { syncUserRepositories: syncUserRepos } as any;
  const emailVerificationService = { verifyCode, sendCode: jest.fn() } as any;

  const service = new AuthService(jwtService, configService, userService, syncService, emailVerificationService);
  return { service, findByEmail, findByGithubId, create, update, signAsync, verifyAsync, configGet, verifyCode };
}

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── validateUser ───────────────────────────────────────────────────────────
  describe('validateUser', () => {
    it('throws when user not found', async () => {
      const { service } = makeService({ findByEmail: jest.fn().mockResolvedValue(null) });
      await expect(service.validateUser('x@x.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user has no passwordHash (OAuth user)', async () => {
      const { service } = makeService({
        findByEmail: jest.fn().mockResolvedValue(makeUser({ passwordHash: null })),
      });
      await expect(service.validateUser('x@x.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws when password does not match', async () => {
      const { service } = makeService({
        findByEmail: jest.fn().mockResolvedValue(makeUser()),
      });
      mockBcryptCompare.mockResolvedValue(false);
      await expect(service.validateUser('x@x.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('returns user on correct password', async () => {
      const user = makeUser();
      const { service } = makeService({
        findByEmail: jest.fn().mockResolvedValue(user),
      });
      mockBcryptCompare.mockResolvedValue(true);
      const result = await service.validateUser('alice@example.com', 'correct');
      expect(result).toBe(user);
    });

    it('requires a valid login verification code after password succeeds', async () => {
      const user = makeUser();
      const { service, verifyCode } = makeService({
        findByEmail: jest.fn().mockResolvedValue(user),
      });
      mockBcryptCompare.mockResolvedValue(true);
      const result = await service.validateUserWithVerification('alice@example.com', 'correct', '123456');
      expect(result).toBe(user);
      expect(verifyCode).toHaveBeenCalledWith('alice@example.com', 'LOGIN', '123456');
    });
  });

  // ── generateTokens ─────────────────────────────────────────────────────────
  describe('generateTokens', () => {
    it('returns accessToken and refreshToken', async () => {
      const { service } = makeService({
        signAsync: jest.fn().mockResolvedValue('signed-token'),
      });
      const result = await service.generateTokens({ sub: 'u1', email: 'a@a.com', role: 'MEMBER' });
      expect(result).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
    });
  });

  // ── refreshTokens ──────────────────────────────────────────────────────────
  describe('refreshTokens', () => {
    it('throws when refresh token is invalid', async () => {
      const { service } = makeService({
        verifyAsync: jest.fn().mockRejectedValue(new Error('expired')),
      });
      await expect(service.refreshTokens('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('returns new token pair on valid refresh token', async () => {
      const payload = { sub: 'u1', email: 'a@a.com', role: 'MEMBER' };
      const { service } = makeService({
        verifyAsync: jest.fn().mockResolvedValue(payload),
        signAsync: jest.fn().mockResolvedValue('new-token'),
      });
      const result = await service.refreshTokens('valid-refresh');
      expect(result.accessToken).toBe('new-token');
    });
  });

  // ── handleGithubAuth ───────────────────────────────────────────────────────
  describe('handleGithubAuth', () => {
    const profile = {
      id: 'gh-123',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatar: 'https://avatar.url',
      githubAccessToken: 'gat',
      githubRefreshToken: 'grt',
    };

    it('throws when email is missing', async () => {
      const { service } = makeService();
      await expect(
        service.handleGithubAuth({ ...profile, email: undefined }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('creates new user when no existing user found', async () => {
      const { service, create } = makeService({
        findByGithubId: jest.fn().mockResolvedValue(null),
        findByEmail: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(makeUser()),
      });
      await service.handleGithubAuth(profile);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: profile.email }));
    });

    it('links existing email user to github when githubId not yet set', async () => {
      const existingUser = makeUser();
      const { service, update } = makeService({
        findByGithubId: jest.fn().mockResolvedValue(null),
        findByEmail: jest.fn().mockResolvedValue(existingUser),
        update: jest.fn().mockResolvedValue(existingUser),
      });
      await service.handleGithubAuth(profile);
      expect(update).toHaveBeenCalledWith(existingUser.id, expect.objectContaining({ githubId: profile.id }));
    });

    it('updates tokens when github user already exists', async () => {
      const existingUser = makeUser({ githubId: 'gh-123' });
      const { service, update } = makeService({
        findByGithubId: jest.fn().mockResolvedValue(existingUser),
        update: jest.fn().mockResolvedValue(existingUser),
      });
      await service.handleGithubAuth(profile);
      expect(update).toHaveBeenCalledWith(existingUser.id, expect.objectContaining({ githubAccessToken: 'gat' }));
    });

    it('returns token pair on success', async () => {
      const { service } = makeService({
        findByGithubId: jest.fn().mockResolvedValue(makeUser()),
        update: jest.fn().mockResolvedValue(makeUser()),
        signAsync: jest.fn().mockResolvedValue('tok'),
      });
      const result = await service.handleGithubAuth(profile);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  // ── handleGithubEnvTokenAuth ───────────────────────────────────────────────
  describe('handleGithubEnvTokenAuth', () => {
    it('throws when DESKTOP_AUTH_MODE is not env', async () => {
      const { service } = makeService({ configGet: jest.fn().mockReturnValue('oauth') });
      await expect(service.handleGithubEnvTokenAuth()).rejects.toThrow(UnauthorizedException);
    });

    it('throws when GITHUB_TOKEN not configured', async () => {
      const { service } = makeService({
        configGet: jest.fn().mockImplementation((key: string) =>
          key === 'DESKTOP_AUTH_MODE' ? 'env' : undefined,
        ),
      });
      await expect(service.handleGithubEnvTokenAuth()).rejects.toThrow(UnauthorizedException);
    });
  });
});
