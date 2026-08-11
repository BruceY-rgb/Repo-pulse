jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  prisma: {
    user: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    appConfig: { findUnique: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { prisma } from '@repo-pulse/database';
import { AuthService } from '../../src/modules/auth/auth.service';

jest.mock('bcrypt');

const mockBcryptCompare = bcrypt.compare as jest.Mock;
const mockBcryptHash = bcrypt.hash as jest.Mock;
const mockUserCount = prisma.user.count as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockUserFindFirst = prisma.user.findFirst as jest.Mock;
const mockUserCreate = prisma.user.create as jest.Mock;
const mockUserUpdate = prisma.user.update as jest.Mock;
const mockAppConfigFindUnique = prisma.appConfig.findUnique as jest.Mock;
const mockAppConfigUpsert = prisma.appConfig.upsert as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

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
  create: jest.Mock;
  signAsync: jest.Mock;
  verifyAsync: jest.Mock;
  configGet: jest.Mock;
}> = {}) {
  const findByEmail = overrides.findByEmail ?? jest.fn().mockResolvedValue(null);
  const create = overrides.create ?? jest.fn().mockResolvedValue(makeUser());
  const signAsync = overrides.signAsync ?? jest.fn().mockResolvedValue('token-xxx');
  const verifyAsync = overrides.verifyAsync ?? jest.fn();
  const configGet = overrides.configGet ?? jest.fn().mockReturnValue(undefined);

  const jwtService = { signAsync, verifyAsync } as any;
  const configService = { get: configGet } as any;
  const userService = { findByEmail, create } as any;

  const service = new AuthService(jwtService, configService, userService);
  return { service, findByEmail, create, signAsync, verifyAsync, configGet };
}

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppConfigFindUnique.mockResolvedValue(null);
    mockAppConfigUpsert.mockResolvedValue({});
    mockUserFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockUserUpdate.mockResolvedValue({});
    mockTransaction.mockResolvedValue([]);
    mockBcryptHash.mockResolvedValue('new-hash');
  });

  describe('local desktop identity', () => {
    it('creates an ADMIN local user for an empty database and persists the selection', async () => {
      const localUser = makeUser({ id: 'local-1', email: 'local@repo-pulse.app', role: 'ADMIN', passwordHash: null });
      mockUserCreate.mockResolvedValue(localUser);
      const { service } = makeService();

      await expect(service.resolveLocalDesktopUser()).resolves.toBe(localUser);
      expect(mockUserCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'local@repo-pulse.app', role: 'ADMIN' }),
      });
      expect(mockAppConfigUpsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ value: 'local-1' }),
      }));
    });

    it('reuses the configured user and never creates a duplicate on repeated startup', async () => {
      const existing = makeUser({ id: 'selected-user' });
      mockAppConfigFindUnique.mockResolvedValue({ value: 'selected-user' });
      mockUserFindUnique.mockResolvedValue(existing);
      const { service } = makeService();

      await service.resolveLocalDesktopUser();
      await service.resolveLocalDesktopUser();
      expect(mockUserCreate).not.toHaveBeenCalled();
      expect(mockUserFindUnique).toHaveBeenCalledTimes(2);
    });

    it('deterministically chooses the earliest ADMIN when legacy users exist', async () => {
      const admin = makeUser({ id: 'oldest-admin', role: 'ADMIN' });
      mockUserFindFirst.mockResolvedValueOnce(admin);
      const { service } = makeService();

      await expect(service.resolveLocalDesktopUser()).resolves.toBe(admin);
      expect(mockUserFindFirst).toHaveBeenCalledWith({
        where: { role: 'ADMIN' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(mockUserCreate).not.toHaveBeenCalled();
    });
  });

  describe('desktop session and app lock', () => {
    it('creates a standard JWT session without a password when the lock is disabled', async () => {
      const user = makeUser();
      const { service } = makeService({ signAsync: jest.fn().mockResolvedValue('signed') });
      jest.spyOn(service, 'resolveLocalDesktopUser').mockResolvedValue(user as any);
      jest.spyOn(service, 'getAppLockStatus').mockResolvedValue({ enabled: false, hasPassword: true });

      await expect(service.createDesktopSession()).resolves.toMatchObject({
        status: 'authenticated',
        lockEnabled: false,
        tokens: { accessToken: 'signed', refreshToken: 'signed' },
      });
    });

    it('requires the password when the app lock is enabled', async () => {
      const user = makeUser({ passwordHash: 'hash' });
      const { service } = makeService();
      jest.spyOn(service, 'resolveLocalDesktopUser').mockResolvedValue(user as any);
      jest.spyOn(service, 'getAppLockStatus').mockResolvedValue({ enabled: true, hasPassword: true });

      await expect(service.createDesktopSession()).resolves.toEqual({ status: 'locked', lockEnabled: true });
      mockBcryptCompare.mockResolvedValue(false);
      await expect(service.createDesktopSession('wrong-password')).rejects.toThrow(UnauthorizedException);
    });

    it('unlocks with the correct password and issues the existing JWT cookies payload', async () => {
      const user = makeUser({ passwordHash: 'hash' });
      const { service } = makeService({ signAsync: jest.fn().mockResolvedValue('signed') });
      jest.spyOn(service, 'resolveLocalDesktopUser').mockResolvedValue(user as any);
      jest.spyOn(service, 'getAppLockStatus').mockResolvedValue({ enabled: true, hasPassword: true });
      mockBcryptCompare.mockResolvedValue(true);

      await expect(service.createDesktopSession('correct-password')).resolves.toMatchObject({
        status: 'authenticated',
        lockEnabled: true,
      });
    });

    it('enables, changes and disables startup verification without deleting the password hash', async () => {
      const { service } = makeService();
      jest.spyOn(service, 'resolveLocalDesktopUser').mockResolvedValue(makeUser({ id: 'u1' }) as any);
      await expect(service.enableAppLock('u1', 'new-password')).resolves.toEqual({ enabled: true, hasPassword: true });
      expect(mockTransaction).toHaveBeenCalled();

      mockUserFindUnique.mockResolvedValue({ passwordHash: 'hash' });
      mockBcryptCompare.mockResolvedValue(true);
      await expect(service.changeAppLockPassword('u1', 'old-password', 'new-password')).resolves.toEqual({ enabled: true, hasPassword: true });
      await expect(service.disableAppLock('u1', 'new-password')).resolves.toEqual({ enabled: false, hasPassword: true });
      expect(mockAppConfigUpsert).toHaveBeenLastCalledWith(expect.objectContaining({
        update: expect.objectContaining({ value: 'false' }),
      }));
      expect(mockUserUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ data: { passwordHash: null } }));
    });

    it('prevents a non-selected legacy user from changing the global desktop lock', async () => {
      const { service } = makeService();
      jest.spyOn(service, 'resolveLocalDesktopUser').mockResolvedValue(makeUser({ id: 'selected-user' }) as any);
      await expect(service.enableAppLock('other-user', 'new-password')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── validateUser ───────────────────────────────────────────────────────────
  describe('validateUser', () => {
    it('throws when user not found', async () => {
      const { service } = makeService({ findByEmail: jest.fn().mockResolvedValue(null) });
      await expect(service.validateUser('x@x.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws when user has no passwordHash', async () => {
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

    it('uses the same error message for unknown email and wrong password (no user enumeration)', async () => {
      const { service: noUserService } = makeService({ findByEmail: jest.fn().mockResolvedValue(null) });
      const noUserError = await noUserService.validateUser('x@x.com', 'pw').catch((e) => e);

      const { service: wrongPwService } = makeService({
        findByEmail: jest.fn().mockResolvedValue(makeUser()),
      });
      mockBcryptCompare.mockResolvedValue(false);
      const wrongPwError = await wrongPwService.validateUser('x@x.com', 'pw').catch((e) => e);

      expect(noUserError.message).toBe(wrongPwError.message);
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

    it('normalizes email before lookup (trim + lowercase)', async () => {
      const user = makeUser();
      const findByEmail = jest.fn().mockResolvedValue(user);
      const { service } = makeService({ findByEmail });
      mockBcryptCompare.mockResolvedValue(true);
      await service.validateUser('  Alice@Example.COM ', 'correct');
      expect(findByEmail).toHaveBeenCalledWith('alice@example.com');
    });
  });

  // ── getBootstrapStatus ─────────────────────────────────────────────────────
  describe('getBootstrapStatus', () => {
    it('returns required=true when no users exist', async () => {
      mockUserCount.mockResolvedValue(0);
      const { service } = makeService();
      await expect(service.getBootstrapStatus()).resolves.toEqual({ required: true });
    });

    it('returns required=false when users exist', async () => {
      mockUserCount.mockResolvedValue(3);
      const { service } = makeService();
      await expect(service.getBootstrapStatus()).resolves.toEqual({ required: false });
    });
  });

  // ── register ───────────────────────────────────────────────────────────────
  describe('register', () => {
    const dto = { email: 'Bob@Example.com', name: 'Bob', password: 'password123' };

    it('throws ConflictException when email is already registered', async () => {
      const { service } = makeService({
        findByEmail: jest.fn().mockResolvedValue(makeUser()),
      });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('creates the first user as ADMIN', async () => {
      mockUserCount.mockResolvedValue(0);
      const create = jest.fn().mockResolvedValue(makeUser({ role: 'ADMIN' }));
      const { service } = makeService({ create });
      await service.register(dto);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ role: 'ADMIN' }));
    });

    it('creates subsequent users as MEMBER', async () => {
      mockUserCount.mockResolvedValue(1);
      const create = jest.fn().mockResolvedValue(makeUser());
      const { service } = makeService({ create });
      await service.register(dto);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ role: 'MEMBER' }));
    });

    it('normalizes email and passes the raw password for hashing', async () => {
      mockUserCount.mockResolvedValue(1);
      const create = jest.fn().mockResolvedValue(makeUser());
      const { service } = makeService({ create });
      await service.register(dto);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'bob@example.com', password: 'password123' }),
      );
    });

    it('falls back to email as name when name is blank', async () => {
      mockUserCount.mockResolvedValue(1);
      const create = jest.fn().mockResolvedValue(makeUser());
      const { service } = makeService({ create });
      await service.register({ ...dto, name: '   ' });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'bob@example.com' }));
    });

    it('trims username and omits it when blank', async () => {
      mockUserCount.mockResolvedValue(1);
      const create = jest.fn().mockResolvedValue(makeUser());
      const { service } = makeService({ create });
      await service.register({ ...dto, username: '  bob-dev  ' });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ username: 'bob-dev' }));

      await service.register({ ...dto, username: '   ' });
      expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ username: undefined }));
    });

    it('maps unique-constraint violations (P2002) during create to ConflictException', async () => {
      mockUserCount.mockResolvedValue(1);
      const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      const { service } = makeService({ create: jest.fn().mockRejectedValue(p2002) });
      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });

    it('rethrows non-P2002 create errors untouched', async () => {
      mockUserCount.mockResolvedValue(1);
      const dbDown = new Error('connection refused');
      const { service } = makeService({ create: jest.fn().mockRejectedValue(dbDown) });
      await expect(service.register(dto)).rejects.toThrow('connection refused');
    });

    it('returns token pair and user info on success', async () => {
      mockUserCount.mockResolvedValue(0);
      const { service } = makeService({
        create: jest.fn().mockResolvedValue(makeUser({ role: 'ADMIN' })),
        signAsync: jest.fn().mockResolvedValue('signed'),
      });
      const result = await service.register(dto);
      expect(result).toMatchObject({
        accessToken: 'signed',
        refreshToken: 'signed',
        userId: 'u1',
        email: 'alice@example.com',
        role: 'ADMIN',
      });
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

    it('signs the refresh token with the configured refresh expiration', async () => {
      const signAsync = jest.fn().mockResolvedValue('t');
      const { service } = makeService({
        signAsync,
        configGet: jest.fn((key: string) => (key === 'JWT_REFRESH_EXPIRATION' ? '90d' : undefined)),
      });
      await service.generateTokens({ sub: 'u1', email: 'a@a.com', role: 'MEMBER' });
      expect(signAsync).toHaveBeenCalledWith(expect.any(Object), { expiresIn: '90d' });
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

  // ── verifyToken ────────────────────────────────────────────────────────────
  describe('verifyToken', () => {
    it('returns payload for a valid token', async () => {
      const payload = { sub: 'u1', email: 'a@a.com', role: 'MEMBER' };
      const { service } = makeService({
        verifyAsync: jest.fn().mockResolvedValue(payload),
      });
      await expect(service.verifyToken('good')).resolves.toEqual(payload);
    });

    it('returns null for an invalid token instead of throwing', async () => {
      const { service } = makeService({
        verifyAsync: jest.fn().mockRejectedValue(new Error('bad signature')),
      });
      await expect(service.verifyToken('bad')).resolves.toBeNull();
    });
  });
});
