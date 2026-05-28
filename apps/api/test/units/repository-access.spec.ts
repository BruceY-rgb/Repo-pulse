/**
 * 单元测试 — 仓库权限工具函数
 * 覆盖 apps/api/src/common/utils/repository-access.ts 的所有分支
 */

import { NotFoundException } from '@nestjs/common';
import { RepositoryAccessLevel, RepositoryAccessMode } from '@repo-pulse/database';

// ── prisma mock ──────────────────────────────────────────────────────────────
const mockUserRepoFindUnique = jest.fn();
const mockUserRepoFindMany = jest.fn();
const mockRepoFindUnique = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: {
    OWNER: 'OWNER',
    ADMIN: 'ADMIN',
    MAINTAIN: 'MAINTAIN',
    WRITE: 'WRITE',
    TRIAGE: 'TRIAGE',
    READ: 'READ',
    NONE: 'NONE',
  },
  RepositoryAccessMode: {
    EDITABLE: 'EDITABLE',
    MONITOR: 'MONITOR',
  },
  prisma: {
    userRepository: {
      findUnique: (...a: any[]) => mockUserRepoFindUnique(...a),
      findMany: (...a: any[]) => mockUserRepoFindMany(...a),
    },
    repository: {
      findUnique: (...a: any[]) => mockRepoFindUnique(...a),
    },
    user: {
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
    },
  },
}));

// 动态 require 确保 mock 已注册
import {
  isEditableRepositoryAccessLevel,
  getUserRepositoryMembership,
  getAccessibleRepositoryIds,
  getUserMonitoredRepositoryIds,
  assertUserCanAccessRepository,
  assertUserCanEditRepository,
} from '@/common/utils/repository-access';
import { RepositoryOperationForbiddenException } from '@/common/exceptions/repository-operation-forbidden.exception';

// ── helpers ──────────────────────────────────────────────────────────────────
function makeMembership(accessLevel: RepositoryAccessLevel): {
  repositoryId: string;
  accessLevel: RepositoryAccessLevel;
  accessMode: RepositoryAccessMode;
  role: string;
} {
  return {
    repositoryId: 'repo-1',
    accessLevel,
    accessMode: RepositoryAccessMode.EDITABLE,
    role: 'member',
  };
}

// ── tests ────────────────────────────────────────────────────────────────────
describe('repository-access 工具函数', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── isEditableRepositoryAccessLevel ───────────────────────────────────────
  describe('isEditableRepositoryAccessLevel()', () => {
    it.each([
      RepositoryAccessLevel.OWNER,
      RepositoryAccessLevel.ADMIN,
      RepositoryAccessLevel.MAINTAIN,
      RepositoryAccessLevel.WRITE,
    ])('%s 应返回 true', (level) => {
      expect(isEditableRepositoryAccessLevel(level)).toBe(true);
    });

    it.each([
      RepositoryAccessLevel.TRIAGE,
      RepositoryAccessLevel.READ,
      RepositoryAccessLevel.NONE,
    ])('%s 应返回 false', (level) => {
      expect(isEditableRepositoryAccessLevel(level)).toBe(false);
    });

    it('null 应返回 false', () => {
      expect(isEditableRepositoryAccessLevel(null)).toBe(false);
    });

    it('undefined 应返回 false', () => {
      expect(isEditableRepositoryAccessLevel(undefined)).toBe(false);
    });
  });

  // ── getUserRepositoryMembership ───────────────────────────────────────────
  describe('getUserRepositoryMembership()', () => {
    it('返回存在的成员关系', async () => {
      const expected = makeMembership(RepositoryAccessLevel.WRITE);
      mockUserRepoFindUnique.mockResolvedValue(expected);

      const result = await getUserRepositoryMembership('user-1', 'repo-1');
      expect(result).toEqual(expected);
      expect(mockUserRepoFindUnique).toHaveBeenCalledWith({
        where: { userId_repositoryId: { userId: 'user-1', repositoryId: 'repo-1' } },
        select: { repositoryId: true, accessLevel: true, accessMode: true, role: true },
      });
    });

    it('成员关系不存在时返回 null', async () => {
      mockUserRepoFindUnique.mockResolvedValue(null);
      const result = await getUserRepositoryMembership('user-1', 'no-such-repo');
      expect(result).toBeNull();
    });
  });

  // ── getAccessibleRepositoryIds ────────────────────────────────────────────
  describe('getAccessibleRepositoryIds()', () => {
    it('返回用户所有可访问仓库 ID', async () => {
      mockUserRepoFindMany.mockResolvedValue([
        { repositoryId: 'repo-1' },
        { repositoryId: 'repo-2' },
      ]);

      const result = await getAccessibleRepositoryIds('user-1');
      expect(result).toEqual(['repo-1', 'repo-2']);
      expect(mockUserRepoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });

    it('editableOnly=true 时，where 包含 accessLevel 过滤', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'repo-1' }]);

      await getAccessibleRepositoryIds('user-1', { editableOnly: true });

      expect(mockUserRepoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            accessLevel: expect.objectContaining({ in: expect.any(Array) }),
          }),
        }),
      );
    });

    it('无成员关系时返回空数组', async () => {
      mockUserRepoFindMany.mockResolvedValue([]);
      const result = await getAccessibleRepositoryIds('new-user');
      expect(result).toEqual([]);
    });
  });

  // ── getUserMonitoredRepositoryIds ─────────────────────────────────────────
  describe('getUserMonitoredRepositoryIds()', () => {
    it('返回 preferences.monitoringScope.repositoryIds', async () => {
      mockUserFindUnique.mockResolvedValue({
        preferences: { monitoringScope: { repositoryIds: ['repo-a', 'repo-b'] } },
      });

      const result = await getUserMonitoredRepositoryIds('user-1');
      expect(result).toEqual(['repo-a', 'repo-b']);
    });

    it('preferences 为空时返回空数组', async () => {
      mockUserFindUnique.mockResolvedValue({ preferences: null });
      const result = await getUserMonitoredRepositoryIds('user-1');
      expect(result).toEqual([]);
    });

    it('用户不存在时返回空数组', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const result = await getUserMonitoredRepositoryIds('no-such-user');
      expect(result).toEqual([]);
    });

    it('repositoryIds 中非字符串元素被过滤掉', async () => {
      mockUserFindUnique.mockResolvedValue({
        preferences: { monitoringScope: { repositoryIds: ['repo-1', null, 123, '', 'repo-2'] } },
      });

      const result = await getUserMonitoredRepositoryIds('user-1');
      expect(result).toEqual(['repo-1', 'repo-2']);
    });
  });

  // ── assertUserCanAccessRepository ─────────────────────────────────────────
  describe('assertUserCanAccessRepository()', () => {
    it('仓库不存在时抛 NotFoundException', async () => {
      mockRepoFindUnique.mockResolvedValue(null);

      await expect(assertUserCanAccessRepository('user-1', 'bad-repo')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('用户不是成员时抛 RepositoryOperationForbiddenException', async () => {
      mockRepoFindUnique.mockResolvedValue({ id: 'repo-1' });
      mockUserRepoFindUnique.mockResolvedValue(null);

      await expect(assertUserCanAccessRepository('user-1', 'repo-1')).rejects.toThrow(
        RepositoryOperationForbiddenException,
      );
    });

    it('accessLevel 为 NONE 时抛 RepositoryOperationForbiddenException', async () => {
      mockRepoFindUnique.mockResolvedValue({ id: 'repo-1' });
      mockUserRepoFindUnique.mockResolvedValue(makeMembership(RepositoryAccessLevel.NONE));

      await expect(assertUserCanAccessRepository('user-1', 'repo-1')).rejects.toThrow(
        RepositoryOperationForbiddenException,
      );
    });

    it.each([
      RepositoryAccessLevel.READ,
      RepositoryAccessLevel.WRITE,
      RepositoryAccessLevel.ADMIN,
      RepositoryAccessLevel.OWNER,
    ])('accessLevel 为 %s 时正常返回成员信息', async (level) => {
      mockRepoFindUnique.mockResolvedValue({ id: 'repo-1' });
      const membership = makeMembership(level);
      mockUserRepoFindUnique.mockResolvedValue(membership);

      const result = await assertUserCanAccessRepository('user-1', 'repo-1');
      expect(result).toEqual(membership);
    });
  });

  // ── assertUserCanEditRepository ───────────────────────────────────────────
  describe('assertUserCanEditRepository()', () => {
    it('READ 权限时抛 RepositoryOperationForbiddenException', async () => {
      mockRepoFindUnique.mockResolvedValue({ id: 'repo-1' });
      mockUserRepoFindUnique.mockResolvedValue(makeMembership(RepositoryAccessLevel.READ));

      await expect(assertUserCanEditRepository('user-1', 'repo-1')).rejects.toThrow(
        RepositoryOperationForbiddenException,
      );
    });

    it('TRIAGE 权限时抛 RepositoryOperationForbiddenException', async () => {
      mockRepoFindUnique.mockResolvedValue({ id: 'repo-1' });
      mockUserRepoFindUnique.mockResolvedValue(makeMembership(RepositoryAccessLevel.TRIAGE));

      await expect(assertUserCanEditRepository('user-1', 'repo-1')).rejects.toThrow(
        RepositoryOperationForbiddenException,
      );
    });

    it.each([
      RepositoryAccessLevel.WRITE,
      RepositoryAccessLevel.MAINTAIN,
      RepositoryAccessLevel.ADMIN,
      RepositoryAccessLevel.OWNER,
    ])('accessLevel 为 %s 时正常返回成员信息', async (level) => {
      mockRepoFindUnique.mockResolvedValue({ id: 'repo-1' });
      const membership = makeMembership(level);
      mockUserRepoFindUnique.mockResolvedValue(membership);

      const result = await assertUserCanEditRepository('user-1', 'repo-1');
      expect(result).toEqual(membership);
    });
  });
});
