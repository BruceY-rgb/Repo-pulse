/**
 * repository.service.extra.spec.ts
 *
 * 补充覆盖 repository.service.ts 中分支覆盖率不足的路径：
 *   - normalizeGithubPullRequest: 已合并 / 已关闭 / stale (跳过)
 *   - normalizeGithubIssue: 已关闭 / pull_request 字段 (跳过) / stale (跳过)
 *   - normalizeGitlabCommit / MergeRequest / Issue: GitLab 分支路径
 *   - resolveGithubAccessLevel: 所有权限级别
 *   - sync 中 successfulSources=0 时不更新 lastSyncAt
 *   - sync 时 PR 和 Issue 都包含在事件中
 */

const mockAssertUserCanAccessRepository = jest.fn();
const mockAssertUserCanEditRepository = jest.fn();
const mockGetUserMonitoredRepositoryIds = jest.fn().mockResolvedValue([]);

const mockRepoFindUnique = jest.fn();
const mockRepoFindMany = jest.fn();
const mockRepoUpsert = jest.fn();
const mockRepoUpdate = jest.fn();
const mockRepoDelete = jest.fn();
const mockUserRepoUpsert = jest.fn();
const mockUserRepoFindMany = jest.fn();
const mockEventFindMany = jest.fn();
const mockEventUpdate = jest.fn();

jest.mock('../../src/common/utils/repository-access', () => ({
  assertUserCanAccessRepository: (...a: any[]) => mockAssertUserCanAccessRepository(...a),
  assertUserCanEditRepository: (...a: any[]) => mockAssertUserCanEditRepository(...a),
  getUserMonitoredRepositoryIds: (...a: any[]) => mockGetUserMonitoredRepositoryIds(...a),
  getAccessibleRepositoryIds: jest.fn().mockResolvedValue([]),
  getUserRepositoryMembership: jest.fn().mockResolvedValue(null),
  isEditableRepositoryAccessLevel: (level: string) =>
    ['OWNER', 'ADMIN', 'MAINTAIN', 'WRITE'].includes(level),
}));

jest.mock('@repo-pulse/database', () => ({
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
  },
  RepositoryAccessLevel: {
    OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN',
    WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE',
  },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  PrismaClient: jest.fn().mockImplementation(() => ({
    repository: {
      findUnique: (...a: any[]) => mockRepoFindUnique(...a),
      findMany: (...a: any[]) => mockRepoFindMany(...a),
      upsert: (...a: any[]) => mockRepoUpsert(...a),
      update: (...a: any[]) => mockRepoUpdate(...a),
      delete: (...a: any[]) => mockRepoDelete(...a),
    },
    userRepository: {
      upsert: (...a: any[]) => mockUserRepoUpsert(...a),
      findMany: (...a: any[]) => mockUserRepoFindMany(...a),
    },
    event: {
      findMany: (...a: any[]) => mockEventFindMany(...a),
      update: (...a: any[]) => mockEventUpdate(...a),
    },
  })),
}));

jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => {} }));
jest.mock('../../src/modules/event/event.service', () => ({ EventService: jest.fn() }));

import { RepositoryService } from '../../src/modules/repository/repository.service';

// ── mock services ──────────────────────────────────────────────────────────────
const mockGithubService = {
  getRepository: jest.fn(),
  getBranches: jest.fn().mockResolvedValue([]),
  getCommits: jest.fn().mockResolvedValue([]),
  getPullRequests: jest.fn().mockResolvedValue([]),
  getIssues: jest.fn().mockResolvedValue([]),
  getUserRepositories: jest.fn().mockResolvedValue([]),
  getStarredRepositories: jest.fn().mockResolvedValue([]),
  searchRepositories: jest.fn().mockResolvedValue([]),
  createWebhook: jest.fn().mockResolvedValue('wh-1'),
  deleteWebhook: jest.fn().mockResolvedValue(undefined),
};

const mockGitlabService = {
  getRepository: jest.fn(),
  getBranches: jest.fn().mockResolvedValue([]),
  getCommits: jest.fn().mockResolvedValue([]),
  getMergeRequests: jest.fn().mockResolvedValue([]),
  getIssues: jest.fn().mockResolvedValue([]),
  createWebhook: jest.fn().mockResolvedValue(undefined),
  deleteWebhook: jest.fn().mockResolvedValue(undefined),
};

const mockEventService = {
  create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
  findByExternalId: jest.fn().mockResolvedValue(null),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('http://localhost:3001'),
};

function makeRepo(overrides: object = {}) {
  return {
    id: 'r1',
    name: 'repo',
    fullName: 'org/repo',
    platform: 'GITHUB',
    externalId: 'ext-1',
    url: 'https://github.com/org/repo',
    defaultBranch: 'main',
    webhookId: null,
    webhookSecret: 'secret',
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    users: [],
    events: [],
    ...overrides,
  };
}

// Recent date (within 7 days of "now")
const RECENT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
// Stale date (older than 30 days)
const STALE = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

// ── helpers to call private normalize methods ──────────────────────────────────
function getSvc(): RepositoryService {
  const svc = new RepositoryService(
    mockConfigService as any,
    mockGithubService as any,
    mockGitlabService as any,
    mockEventService as any,
  );
  return svc;
}

// ── normalizeGithubPullRequest ─────────────────────────────────────────────────
describe('RepositoryService — normalizeGithubPullRequest', () => {
  let svc: RepositoryService;
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    jest.clearAllMocks();
    svc = getSvc();
  });

  it('returns null when pr.id is missing', () => {
    const result = (svc as any).normalizeGithubPullRequest({ updated_at: RECENT }, sinceDate);
    expect(result).toBeNull();
  });

  it('returns null when PR is stale (older than sinceDate)', () => {
    const result = (svc as any).normalizeGithubPullRequest(
      { id: 1, updated_at: STALE, created_at: STALE },
      sinceDate,
    );
    expect(result).toBeNull();
  });

  it('maps an open PR to PR_OPENED type', () => {
    const result = (svc as any).normalizeGithubPullRequest(
      {
        id: 101,
        title: 'feat: add login',
        state: 'open',
        merged_at: null,
        updated_at: RECENT,
        created_at: RECENT,
        user: { login: 'alice', avatar_url: 'av' },
        head: { ref: 'feature/login' },
        base: { ref: 'main' },
        number: 5,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('PR_OPENED');
    expect(result.externalId).toBe('gh-pr-101');
    expect(result.sourceBranch).toBe('feature/login');
    expect(result.targetBranch).toBe('main');
  });

  it('maps a merged PR to PR_MERGED type', () => {
    const mergedAt = RECENT;
    const result = (svc as any).normalizeGithubPullRequest(
      {
        id: 102,
        title: 'feat: merge',
        state: 'closed',
        merged_at: mergedAt,
        closed_at: mergedAt,
        updated_at: RECENT,
        user: { login: 'bob' },
        head: { ref: 'feature/x' },
        base: { ref: 'main' },
        number: 6,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('PR_MERGED');
    expect(result.action).toBe('merged');
  });

  it('maps a closed (not merged) PR to PR_CLOSED type', () => {
    const closedAt = RECENT;
    const result = (svc as any).normalizeGithubPullRequest(
      {
        id: 103,
        title: 'feat: close without merge',
        state: 'closed',
        merged_at: null,
        closed_at: closedAt,
        updated_at: RECENT,
        user: { login: 'carol' },
        head: { ref: 'feature/y' },
        base: { ref: 'main' },
        number: 7,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('PR_CLOSED');
    expect(result.action).toBe('closed');
    expect(result.occurredAt).toEqual(new Date(closedAt));
  });
});

// ── normalizeGithubIssue ───────────────────────────────────────────────────────
describe('RepositoryService — normalizeGithubIssue', () => {
  let svc: RepositoryService;
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    jest.clearAllMocks();
    svc = getSvc();
  });

  it('returns null when issue has pull_request field (is actually a PR)', () => {
    const result = (svc as any).normalizeGithubIssue(
      { id: 1, pull_request: {}, updated_at: RECENT },
      sinceDate,
    );
    expect(result).toBeNull();
  });

  it('returns null when id is missing', () => {
    const result = (svc as any).normalizeGithubIssue({ updated_at: RECENT }, sinceDate);
    expect(result).toBeNull();
  });

  it('returns null when issue is stale', () => {
    const result = (svc as any).normalizeGithubIssue(
      { id: 10, updated_at: STALE, created_at: STALE },
      sinceDate,
    );
    expect(result).toBeNull();
  });

  it('maps an open issue to ISSUE_OPENED', () => {
    const result = (svc as any).normalizeGithubIssue(
      {
        id: 201,
        title: 'bug: crash on startup',
        state: 'open',
        created_at: RECENT,
        updated_at: RECENT,
        user: { login: 'alice', avatar_url: 'av' },
        number: 11,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('ISSUE_OPENED');
    expect(result.externalId).toBe('gh-issue-201');
  });

  it('maps a closed issue to ISSUE_CLOSED', () => {
    const closedAt = RECENT;
    const result = (svc as any).normalizeGithubIssue(
      {
        id: 202,
        title: 'bug: fixed',
        state: 'closed',
        closed_at: closedAt,
        updated_at: RECENT,
        user: { login: 'bob' },
        number: 12,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('ISSUE_CLOSED');
    expect(result.occurredAt).toEqual(new Date(closedAt));
  });
});

// ── normalizeGitlabCommit ──────────────────────────────────────────────────────
describe('RepositoryService — normalizeGitlabCommit', () => {
  let svc: RepositoryService;

  beforeEach(() => { svc = getSvc(); });

  it('returns null when commit id is missing', () => {
    const result = (svc as any).normalizeGitlabCommit({ message: 'fix' }, 'main');
    expect(result).toBeNull();
  });

  it('maps a valid GitLab commit to PUSH event', () => {
    const result = (svc as any).normalizeGitlabCommit(
      {
        id: 'gl-abc123',
        message: 'fix: issue resolved',
        author_name: 'Dev',
        authored_date: RECENT,
        web_url: 'https://gitlab.com/...',
      },
      'main',
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('PUSH');
    expect(result.externalId).toBe('gl-abc123');
    expect(result.branch).toBe('main');
  });
});

// ── normalizeGitlabMergeRequest ────────────────────────────────────────────────
describe('RepositoryService — normalizeGitlabMergeRequest', () => {
  let svc: RepositoryService;
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  beforeEach(() => { svc = getSvc(); });

  it('returns null when mr.id is missing', () => {
    const result = (svc as any).normalizeGitlabMergeRequest({ updated_at: RECENT }, sinceDate);
    expect(result).toBeNull();
  });

  it('returns null when MR is stale', () => {
    const result = (svc as any).normalizeGitlabMergeRequest(
      { id: 1, updated_at: STALE, created_at: STALE },
      sinceDate,
    );
    expect(result).toBeNull();
  });

  it('maps an open GitLab MR to PR_OPENED', () => {
    const result = (svc as any).normalizeGitlabMergeRequest(
      {
        id: 301,
        title: 'feat: new feature',
        state: 'opened',
        merged_at: null,
        updated_at: RECENT,
        created_at: RECENT,
        author: { username: 'dev', avatar_url: 'av' },
        source_branch: 'feature/x',
        target_branch: 'main',
        iid: 10,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('PR_OPENED');
  });

  it('maps a merged GitLab MR to PR_MERGED', () => {
    const result = (svc as any).normalizeGitlabMergeRequest(
      {
        id: 302,
        title: 'feat: merged',
        state: 'merged',
        merged_at: RECENT,
        updated_at: RECENT,
        author: { username: 'dev' },
        source_branch: 'feature/y',
        target_branch: 'main',
        iid: 11,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('PR_MERGED');
  });

  it('maps a closed GitLab MR to PR_CLOSED', () => {
    const result = (svc as any).normalizeGitlabMergeRequest(
      {
        id: 303,
        title: 'feat: closed',
        state: 'closed',
        merged_at: null,
        closed_at: RECENT,
        updated_at: RECENT,
        author: { username: 'dev' },
        source_branch: 'feature/z',
        target_branch: 'main',
        iid: 12,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('PR_CLOSED');
  });
});

// ── normalizeGitlabIssue ───────────────────────────────────────────────────────
describe('RepositoryService — normalizeGitlabIssue', () => {
  let svc: RepositoryService;
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  beforeEach(() => { svc = getSvc(); });

  it('returns null when issue.id is missing', () => {
    const result = (svc as any).normalizeGitlabIssue({ updated_at: RECENT }, sinceDate);
    expect(result).toBeNull();
  });

  it('returns null when GitLab issue is stale', () => {
    const result = (svc as any).normalizeGitlabIssue(
      { id: 1, updated_at: STALE, created_at: STALE },
      sinceDate,
    );
    expect(result).toBeNull();
  });

  it('maps an open GitLab issue to ISSUE_OPENED', () => {
    const result = (svc as any).normalizeGitlabIssue(
      {
        id: 401,
        title: 'bug: null pointer',
        state: 'opened',
        created_at: RECENT,
        updated_at: RECENT,
        author: { username: 'dev', avatar_url: 'av' },
        iid: 20,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('ISSUE_OPENED');
    expect(result.externalId).toBe('gl-issue-401');
  });

  it('maps a closed GitLab issue to ISSUE_CLOSED', () => {
    const result = (svc as any).normalizeGitlabIssue(
      {
        id: 402,
        title: 'bug: fixed',
        state: 'closed',
        closed_at: RECENT,
        updated_at: RECENT,
        author: { username: 'dev' },
        iid: 21,
      },
      sinceDate,
    );
    expect(result).not.toBeNull();
    expect(result.type).toBe('ISSUE_CLOSED');
  });
});

// ── resolveGithubAccessLevel ───────────────────────────────────────────────────
describe('RepositoryService — resolveGithubAccessLevel', () => {
  let svc: RepositoryService;

  beforeEach(() => { svc = getSvc(); });

  it('returns OWNER when githubLogin matches repo owner', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'Alice' }, permissions: { admin: true } },
      'alice',
    );
    expect(result).toBe('OWNER');
  });

  it('returns ADMIN when permissions.admin is true (no login match)', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'org' }, permissions: { admin: true } },
      'alice',
    );
    expect(result).toBe('ADMIN');
  });

  it('returns MAINTAIN when permissions.maintain is true', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'org' }, permissions: { admin: false, maintain: true } },
      'alice',
    );
    expect(result).toBe('MAINTAIN');
  });

  it('returns WRITE when permissions.push is true', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'org' }, permissions: { push: true } },
      'alice',
    );
    expect(result).toBe('WRITE');
  });

  it('returns TRIAGE when permissions.triage is true', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'org' }, permissions: { triage: true } },
      'alice',
    );
    expect(result).toBe('TRIAGE');
  });

  it('returns READ when only permissions.pull is true', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'org' }, permissions: { pull: true } },
      'alice',
    );
    expect(result).toBe('READ');
  });

  it('returns NONE when no permissions match and no login match', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'org' }, permissions: {} },
      null,
    );
    expect(result).toBe('NONE');
  });

  it('returns NONE when permissions is undefined', () => {
    const result = (svc as any).resolveGithubAccessLevel(
      { owner: { login: 'org' } },
      null,
    );
    expect(result).toBe('NONE');
  });
});

// ── sync — PR and Issue events included ───────────────────────────────────────
describe('RepositoryService.sync — GitHub PR and Issue events', () => {
  let svc: RepositoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = getSvc();
    mockEventService.findByExternalId.mockResolvedValue(null);
    mockRepoUpdate.mockResolvedValue({});
  });

  it('creates PR_OPENED event when GitHub PR is open', async () => {
    mockRepoFindUnique.mockResolvedValue(makeRepo({
      platform: 'GITHUB',
      users: [{ user: { githubAccessToken: 'token' } }],
    }));
    mockGithubService.getBranches.mockResolvedValue([]);
    mockGithubService.getCommits.mockResolvedValue([]);
    mockGithubService.getPullRequests.mockResolvedValue([{
      id: 501,
      title: 'feat: open PR',
      state: 'open',
      merged_at: null,
      updated_at: RECENT,
      created_at: RECENT,
      user: { login: 'dev', avatar_url: null },
      head: { ref: 'feature/a' },
      base: { ref: 'main' },
      number: 1,
    }]);
    mockGithubService.getIssues.mockResolvedValue([]);

    const result = await svc.sync('r1');
    expect(result.createdCount).toBe(1);
    expect(mockEventService.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PR_OPENED', externalId: 'gh-pr-501' }),
    );
  });

  it('creates ISSUE_CLOSED event when GitHub Issue is closed', async () => {
    mockRepoFindUnique.mockResolvedValue(makeRepo({
      platform: 'GITHUB',
      users: [{ user: { githubAccessToken: 'token' } }],
    }));
    mockGithubService.getBranches.mockResolvedValue([]);
    mockGithubService.getCommits.mockResolvedValue([]);
    mockGithubService.getPullRequests.mockResolvedValue([]);
    mockGithubService.getIssues.mockResolvedValue([{
      id: 601,
      title: 'bug: fixed',
      state: 'closed',
      closed_at: RECENT,
      updated_at: RECENT,
      user: { login: 'dev', avatar_url: null },
      number: 10,
    }]);

    const result = await svc.sync('r1');
    expect(result.createdCount).toBe(1);
    expect(mockEventService.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ISSUE_CLOSED', externalId: 'gh-issue-601' }),
    );
  });

  it('does not update lastSyncAt when all sources fail (successfulSources=0)', async () => {
    mockRepoFindUnique.mockResolvedValue(makeRepo({
      platform: 'GITHUB',
      users: [{ user: { githubAccessToken: null } }],
    }));

    const result = await svc.sync('r1');
    expect(result.failedSources).toContain('github_token_missing');
    expect(mockRepoUpdate).not.toHaveBeenCalled();
  });

  it('creates GitLab MR and Issue events together', async () => {
    mockRepoFindUnique.mockResolvedValue(makeRepo({
      platform: 'GITLAB',
      users: [{ user: { githubAccessToken: null } }],
    }));
    mockGitlabService.getBranches.mockResolvedValue([]);
    mockGitlabService.getCommits.mockResolvedValue([]);
    mockGitlabService.getMergeRequests.mockResolvedValue([{
      id: 701,
      title: 'feat: GL MR',
      state: 'opened',
      merged_at: null,
      updated_at: RECENT,
      created_at: RECENT,
      author: { username: 'gl-dev', avatar_url: null },
      source_branch: 'feature/gl',
      target_branch: 'main',
      iid: 5,
    }]);
    mockGitlabService.getIssues.mockResolvedValue([{
      id: 801,
      title: 'GL issue open',
      state: 'opened',
      created_at: RECENT,
      updated_at: RECENT,
      author: { username: 'gl-dev', avatar_url: null },
      iid: 15,
    }]);

    const result = await svc.sync('r1');
    expect(result.createdCount).toBe(2);
    expect(mockEventService.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PR_OPENED', externalId: 'gl-mr-701' }),
    );
    expect(mockEventService.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ISSUE_OPENED', externalId: 'gl-issue-801' }),
    );
  });
});

// ── parseRepositoryPath edge case ─────────────────────────────────────────────
describe('RepositoryService — parseRepositoryPath', () => {
  let svc: RepositoryService;

  beforeEach(() => { svc = getSvc(); });

  it('splits owner/repo correctly', () => {
    const result = (svc as any).parseRepositoryPath('owner/my-repo');
    expect(result).toEqual(['owner', 'my-repo']);
  });

  it('returns [fullName, fullName] when no slash found', () => {
    const result = (svc as any).parseRepositoryPath('no-slash-repo');
    expect(result).toEqual(['no-slash-repo', 'no-slash-repo']);
  });

  it('handles nested paths (takes last slash as separator)', () => {
    const result = (svc as any).parseRepositoryPath('github.com/owner/repo');
    expect(result).toEqual(['github.com/owner', 'repo']);
  });
});
