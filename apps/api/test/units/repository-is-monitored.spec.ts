/**
 * 验证 searchUserRepositories / searchStarredRepositories 中
 * isMonitored 字段必须通过 externalId 比较，不能直接用 Prisma UUID。
 *
 * 背景：feat/authority 将 getMonitoredGithubExternalIds() 内联时
 * 误将 monitoredSet（Prisma UUID 集合）与 GitHub 数字 ID 比较，
 * 导致 isMonitored 永远为 false。
 */
import { RepositoryService } from '../../src/modules/repository/repository.service';
import { ConfigService } from '@nestjs/config';

// ── mock getUserMonitoredRepositoryIds ─────────────────────────────────────
const mockGetUserMonitoredRepositoryIds = jest.fn();
const mockRepoFindMany = jest.fn();

jest.mock('../../src/common/utils/repository-access', () => ({
  assertUserCanAccessRepository: jest.fn(),
  assertUserCanEditRepository: jest.fn(),
  getUserMonitoredRepositoryIds: (...a: any[]) => mockGetUserMonitoredRepositoryIds(...a),
  getAccessibleRepositoryIds: jest.fn().mockResolvedValue([]),
  getUserRepositoryMembership: jest.fn().mockResolvedValue(null),
  isEditableRepositoryAccessLevel: (level: string) =>
    ['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE'].includes(level),
}));

jest.mock('@repo-pulse/database', () => ({
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  EventType: {},
  RepositoryAccessLevel: {
    OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN',
    WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE',
  },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  PrismaClient: jest.fn().mockImplementation(() => ({
    repository: {
      findMany: (...a: any[]) => mockRepoFindMany(...a),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userRepository: { upsert: jest.fn(), findMany: jest.fn() },
    event: { findMany: jest.fn(), update: jest.fn() },
  })),
}));

jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => {} }));
jest.mock('../../src/modules/event/event.service', () => ({ EventService: jest.fn() }));

// GitHub API 返回的仓库对象（id 为数字型 GitHub ID）
function makeGithubRepo(githubNumericId: number, fullName: string) {
  return {
    id: githubNumericId,
    name: fullName.split('/')[1],
    full_name: fullName,
    description: null,
    html_url: `https://github.com/${fullName}`,
    stargazers_count: 0,
    language: null,
    private: false,
    permissions: { admin: false, push: true, pull: true },
    owner: { login: fullName.split('/')[0], avatar_url: '' },
  };
}

describe('RepositoryService — isMonitored（externalId vs UUID）', () => {
  let service: RepositoryService;
  let mockGithubService: { getUserRepositories: jest.Mock; getStarredRepos: jest.Mock };

  const PRISMA_UUID = 'cluuid-internal-repo-id-0001';  // getUserMonitoredRepositoryIds 返回的格式
  const GITHUB_NUMERIC_ID = 99887766;                   // GitHub API 返回的数字 ID
  const EXTERNAL_ID = String(GITHUB_NUMERIC_ID);        // 数据库中存储的 externalId

  beforeEach(() => {
    jest.clearAllMocks();

    mockGithubService = {
      getUserRepositories: jest.fn(),
      getStarredRepos: jest.fn(),
    };

    const configService = { get: jest.fn().mockReturnValue('http://localhost:3001') } as unknown as ConfigService;
    service = new RepositoryService(
      configService,
      mockGithubService as any,
      {} as any,
      {} as any,
    );

    // 用户监控了一个仓库，monitoringScope 存的是 Prisma UUID
    mockGetUserMonitoredRepositoryIds.mockResolvedValue([PRISMA_UUID]);

    // 该 UUID 对应的数据库记录，externalId 是 GitHub 数字 ID 的字符串形式
    mockRepoFindMany.mockResolvedValue([
      { externalId: EXTERNAL_ID },
    ]);
  });

  describe('searchUserRepositories', () => {
    it('应通过 externalId 匹配：监控仓库的 isMonitored 为 true', async () => {
      mockGithubService.getUserRepositories.mockResolvedValue([
        makeGithubRepo(GITHUB_NUMERIC_ID, 'org/monitored-repo'),
        makeGithubRepo(11111111, 'org/other-repo'),
      ]);

      const result = await service.searchUserRepositories('user-1', 'oauth-token');

      const monitored = result.find((r) => r.fullName === 'org/monitored-repo');
      const other = result.find((r) => r.fullName === 'org/other-repo');

      expect(monitored?.isMonitored).toBe(true);
      expect(other?.isMonitored).toBe(false);
    });

    it('用户无监控范围时默认不监控任何仓库', async () => {
      mockGetUserMonitoredRepositoryIds.mockResolvedValue([]);
      mockGithubService.getUserRepositories.mockResolvedValue([
        makeGithubRepo(GITHUB_NUMERIC_ID, 'org/repo-a'),
      ]);

      const result = await service.searchUserRepositories('user-1', 'oauth-token');
      expect(result[0].isMonitored).toBe(false);
      expect(mockRepoFindMany).not.toHaveBeenCalled();
    });
  });

  describe('searchStarredRepositories', () => {
    it('应通过 externalId 匹配：监控仓库的 isMonitored 为 true', async () => {
      mockGithubService.getStarredRepos.mockResolvedValue([
        makeGithubRepo(GITHUB_NUMERIC_ID, 'org/starred-monitored'),
        makeGithubRepo(22222222, 'org/starred-other'),
      ]);

      const result = await service.searchStarredRepositories('user-1', 'oauth-token');

      const monitored = result.find((r) => r.fullName === 'org/starred-monitored');
      const other = result.find((r) => r.fullName === 'org/starred-other');

      expect(monitored?.isMonitored).toBe(true);
      expect(other?.isMonitored).toBe(false);
    });

    it('无 OAuth token 时直接返回空数组', async () => {
      const result = await service.searchStarredRepositories('user-1', '');
      expect(result).toHaveLength(0);
      expect(mockGithubService.getStarredRepos).not.toHaveBeenCalled();
    });
  });
});
