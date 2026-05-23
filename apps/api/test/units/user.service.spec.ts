import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserService } from '../../src/modules/user/user.service';

jest.mock('bcrypt');
const mockBcryptHash = bcrypt.hash as jest.Mock;

const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  prisma: {
    user: {
      findUnique: (...a: any[]) => mockFindUnique(...a),
      create: (...a: any[]) => mockCreate(...a),
      update: (...a: any[]) => mockUpdate(...a),
    },
  },
  Prisma: {},
}));

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

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserService();
  });

  // ── findById ───────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('throws NotFoundException when user not found', async () => {
      mockFindUnique.mockResolvedValue(null);
      await expect(service.findById('u999')).rejects.toThrow(NotFoundException);
    });

    it('returns user without passwordHash', async () => {
      mockFindUnique.mockResolvedValue(makeUser());
      const result = await service.findById('u1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('alice@example.com');
    });
  });

  // ── findByEmail / findByGithubId ───────────────────────────────────────────
  describe('findByEmail', () => {
    it('returns null when not found', async () => {
      mockFindUnique.mockResolvedValue(null);
      expect(await service.findByEmail('x@x.com')).toBeNull();
    });

    it('returns user when found', async () => {
      const user = makeUser();
      mockFindUnique.mockResolvedValue(user);
      expect(await service.findByEmail('alice@example.com')).toBe(user);
    });
  });

  describe('findByGithubId', () => {
    it('returns null when not found', async () => {
      mockFindUnique.mockResolvedValue(null);
      expect(await service.findByGithubId('gh-1')).toBeNull();
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('hashes password when provided', async () => {
      mockBcryptHash.mockResolvedValue('hashed-pw');
      mockCreate.mockResolvedValue(makeUser());
      await service.create({ email: 'a@a.com', name: 'A', password: 'secret' });
      expect(mockBcryptHash).toHaveBeenCalledWith('secret', 10);
      expect(mockCreate.mock.calls[0][0].data.passwordHash).toBe('hashed-pw');
    });

    it('does not include passwordHash when no password given', async () => {
      mockCreate.mockResolvedValue(makeUser());
      await service.create({ email: 'a@a.com', name: 'A' });
      expect(mockBcryptHash).not.toHaveBeenCalled();
      expect(mockCreate.mock.calls[0][0].data).not.toHaveProperty('passwordHash');
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('only includes provided fields in update', async () => {
      mockUpdate.mockResolvedValue(makeUser({ name: 'Bob' }));
      await service.update('u1', { name: 'Bob' });
      const data = mockUpdate.mock.calls[0][0].data;
      expect(data.name).toBe('Bob');
      expect(data).not.toHaveProperty('githubId');
    });

    it('includes all fields when all are provided', async () => {
      mockUpdate.mockResolvedValue(makeUser());
      await service.update('u1', {
        githubId: 'gh-1',
        githubAccessToken: 'gat',
        githubRefreshToken: 'grt',
        name: 'Alice',
        avatar: 'https://avatar.url',
      });
      const data = mockUpdate.mock.calls[0][0].data;
      expect(data).toMatchObject({ githubId: 'gh-1', name: 'Alice' });
    });
  });

  // ── updateProfile ──────────────────────────────────────────────────────────
  describe('updateProfile', () => {
    it('updates name and email', async () => {
      mockUpdate.mockResolvedValue(makeUser({ name: 'Bob' }));
      const result = await service.updateProfile('u1', { name: 'Bob', email: 'bob@example.com' });
      expect(result).not.toHaveProperty('passwordHash');
      const data = mockUpdate.mock.calls[0][0].data;
      expect(data.name).toBe('Bob');
      expect(data.email).toBe('bob@example.com');
    });

    it('sets avatar to null when empty string passed', async () => {
      mockUpdate.mockResolvedValue(makeUser());
      await service.updateProfile('u1', { avatar: '' });
      expect(mockUpdate.mock.calls[0][0].data.avatar).toBeNull();
    });
  });

  // ── updatePreferences (deepMerge) ──────────────────────────────────────────
  describe('updatePreferences', () => {
    it('deep-merges incoming preferences with existing ones', async () => {
      mockFindUnique.mockResolvedValue({ preferences: { theme: 'dark', notify: { email: true } } });
      mockUpdate.mockResolvedValue(makeUser());
      await service.updatePreferences('u1', { notify: { slack: true } });
      const saved = mockUpdate.mock.calls[0][0].data.preferences;
      expect(saved.theme).toBe('dark');
      expect(saved.notify).toEqual({ email: true, slack: true });
    });

    it('overwrites non-object values', async () => {
      mockFindUnique.mockResolvedValue({ preferences: { theme: 'dark' } });
      mockUpdate.mockResolvedValue(makeUser());
      await service.updatePreferences('u1', { theme: 'light' });
      expect(mockUpdate.mock.calls[0][0].data.preferences.theme).toBe('light');
    });

    it('handles missing preferences gracefully', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockUpdate.mockResolvedValue(makeUser());
      await service.updatePreferences('u1', { theme: 'light' });
      expect(mockUpdate.mock.calls[0][0].data.preferences.theme).toBe('light');
    });
  });
});
