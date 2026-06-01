import axios from 'axios';
import { GithubService } from '../../src/modules/repository/services/github.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

function getHeaders(call: Parameters<typeof mockAxios.create>[0]) {
  return call?.headers as Record<string, unknown> | undefined;
}

describe('GithubService', () => {
  let service: GithubService;
  let mockClient: { get: jest.Mock; post: jest.Mock; delete: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
    // All axios.create() calls return the same mock client
    mockAxios.create = jest.fn().mockReturnValue(mockClient as any);
    mockConfigService = { get: jest.fn().mockReturnValue(undefined) };
    service = new GithubService(mockConfigService as any);
  });

  // ── getRepository ─────────────────────────────────────────────────────────
  describe('getRepository', () => {
    it('returns repo data on success', async () => {
      const repoData = { id: 1, name: 'repo', full_name: 'org/repo', html_url: 'url', default_branch: 'main' };
      mockClient.get.mockResolvedValue({ data: repoData });
      const result = await service.getRepository('org', 'repo');
      expect(result).toBe(repoData);
      expect(mockClient.get).toHaveBeenCalledWith('/repos/org/repo');
    });

    it('throws descriptive error on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      await expect(service.getRepository('org', 'missing')).rejects.toThrow('无法获取仓库 org/missing');
    });

    it('creates new axios client with userToken when provided', async () => {
      mockClient.get.mockResolvedValue({ data: { id: 1 } });
      await service.getRepository('org', 'repo', 'user-token');
      // axios.create called twice: once for defaultClient, once for userClient
      const calls = mockAxios.create.mock.calls;
      const userClientCall = calls.find((call) => getHeaders(call[0])?.Authorization === 'Bearer user-token');
      expect(userClientCall).toBeDefined();
    });
  });

  // ── createWebhook ─────────────────────────────────────────────────────────
  describe('createWebhook', () => {
    it('returns webhook ID on success', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 42 } });
      const result = await service.createWebhook('org', 'repo', 'https://hook.url', 'secret');
      expect(result).toBe(42);
    });

    it('throws provider errors so callers can classify webhook status', async () => {
      mockClient.post.mockRejectedValue(new Error('403 Forbidden'));
      await expect(service.createWebhook('org', 'repo', 'url', 'secret')).rejects.toThrow(
        '403 Forbidden',
      );
    });

    it('sends correct webhook payload', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 99 } });
      await service.createWebhook('org', 'repo', 'https://webhook.example.com', 'my-secret');
      const [path, payload] = mockClient.post.mock.calls[0];
      expect(path).toBe('/repos/org/repo/hooks');
      expect(payload.config.url).toBe('https://webhook.example.com');
      expect(payload.config.secret).toBe('my-secret');
      expect(payload.events).toContain('push');
      expect(payload.events).toContain('pull_request');
    });
  });

  // ── deleteWebhook ─────────────────────────────────────────────────────────
  describe('deleteWebhook', () => {
    it('calls DELETE endpoint', async () => {
      mockClient.delete.mockResolvedValue({});
      await service.deleteWebhook('org', 'repo', 'wh-1');
      expect(mockClient.delete).toHaveBeenCalledWith('/repos/org/repo/hooks/wh-1');
    });

    it('does not throw on failure', async () => {
      mockClient.delete.mockRejectedValue(new Error('404'));
      await expect(service.deleteWebhook('org', 'repo', 'wh-1')).resolves.toBeUndefined();
    });
  });

  // ── getCommits ────────────────────────────────────────────────────────────
  describe('getCommits', () => {
    it('returns commit array on success', async () => {
      const commits = [{ sha: 'abc', commit: { message: 'fix' } }];
      mockClient.get.mockResolvedValue({ data: commits });
      const result = await service.getCommits('org', 'repo', { branch: 'main', since: '2024-01-01' });
      expect(result).toBe(commits);
      expect(mockClient.get).toHaveBeenCalledWith(
        '/repos/org/repo/commits',
        expect.objectContaining({ params: { sha: 'main', since: '2024-01-01' } }),
      );
    });

    it('includes until param when provided', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getCommits('org', 'repo', { until: '2024-12-31' });
      expect(mockClient.get).toHaveBeenCalledWith(
        '/repos/org/repo/commits',
        expect.objectContaining({ params: { until: '2024-12-31' } }),
      );
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('500'));
      const result = await service.getCommits('org', 'repo');
      expect(result).toEqual([]);
    });
  });

  // ── getCommit ─────────────────────────────────────────────────────────────
  describe('getCommit', () => {
    it('returns commit data on success', async () => {
      const commit = { sha: 'abc123', commit: { message: 'fix' } };
      mockClient.get.mockResolvedValue({ data: commit });
      const result = await service.getCommit('org', 'repo', 'abc123');
      expect(result).toBe(commit);
    });

    it('returns null on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      const result = await service.getCommit('org', 'repo', 'bad-sha');
      expect(result).toBeNull();
    });
  });

  // ── getBranches ───────────────────────────────────────────────────────────
  describe('getBranches', () => {
    it('maps branch response to BranchInfo format', async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { name: 'main', protected: true, commit: { sha: 'sha1' } },
          { name: 'develop', protected: false, commit: { sha: 'sha2' } },
        ],
      });
      const result = await service.getBranches('org', 'repo');
      expect(result).toEqual([
        { name: 'main', isProtected: true, lastCommitSha: 'sha1' },
        { name: 'develop', isProtected: false, lastCommitSha: 'sha2' },
      ]);
    });

    it('filters branches with empty names', async () => {
      mockClient.get.mockResolvedValue({
        data: [{ name: '', protected: false }, { name: 'main', protected: false, commit: { sha: 'sha' } }],
      });
      const result = await service.getBranches('org', 'repo');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('main');
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('403'));
      const result = await service.getBranches('org', 'repo');
      expect(result).toEqual([]);
    });
  });

  // ── getPullRequests ───────────────────────────────────────────────────────
  describe('getPullRequests', () => {
    it('returns PRs with state param', async () => {
      const prs = [{ id: 1, title: 'PR' }];
      mockClient.get.mockResolvedValue({ data: prs });
      const result = await service.getPullRequests('org', 'repo', 'open');
      expect(result).toBe(prs);
      expect(mockClient.get).toHaveBeenCalledWith('/repos/org/repo/pulls', expect.objectContaining({ params: { state: 'open' } }));
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('500'));
      expect(await service.getPullRequests('org', 'repo')).toEqual([]);
    });
  });

  // ── getPullRequest ────────────────────────────────────────────────────────
  describe('getPullRequest', () => {
    it('returns PR data on success', async () => {
      const pr = { id: 10, title: 'PR' };
      mockClient.get.mockResolvedValue({ data: pr });
      expect(await service.getPullRequest('org', 'repo', 10)).toBe(pr);
    });

    it('returns null on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      expect(await service.getPullRequest('org', 'repo', 999)).toBeNull();
    });
  });

  // ── getIssues ─────────────────────────────────────────────────────────────
  describe('getIssues', () => {
    it('returns issues on success', async () => {
      const issues = [{ id: 1, title: 'Bug' }];
      mockClient.get.mockResolvedValue({ data: issues });
      expect(await service.getIssues('org', 'repo')).toBe(issues);
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('500'));
      expect(await service.getIssues('org', 'repo')).toEqual([]);
    });
  });

  // ── getIssue ──────────────────────────────────────────────────────────────
  describe('getIssue', () => {
    it('returns issue data on success', async () => {
      const issue = { id: 20, title: 'Issue' };
      mockClient.get.mockResolvedValue({ data: issue });
      expect(await service.getIssue('org', 'repo', 20)).toBe(issue);
    });

    it('returns null on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      expect(await service.getIssue('org', 'repo', 999)).toBeNull();
    });
  });

  // ── searchRepositories ────────────────────────────────────────────────────
  describe('searchRepositories', () => {
    it('returns items from search response', async () => {
      const items = [{ id: 1, name: 'result' }];
      mockClient.get.mockResolvedValue({ data: { items, total_count: 1, incomplete_results: false } });
      const result = await service.searchRepositories('react');
      expect(result).toBe(items);
      expect(mockClient.get).toHaveBeenCalledWith(
        '/search/repositories',
        expect.objectContaining({ params: expect.objectContaining({ q: 'react' }) }),
      );
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('422'));
      expect(await service.searchRepositories('bad-query')).toEqual([]);
    });
  });

  // ── getUserRepositories — retry logic ─────────────────────────────────────
  describe('getUserRepositories', () => {
    let setTimeoutSpy: jest.SpyInstance;

    beforeEach(() => {
      // Make setTimeout fire immediately so retry delays don't block tests
      setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any; });
    });

    afterEach(() => {
      setTimeoutSpy.mockRestore();
    });

    it('returns repos on first successful attempt', async () => {
      const repos = [{ id: 1, name: 'my-repo' }];
      mockClient.get.mockResolvedValue({ data: repos });
      const result = await service.getUserRepositories('user-token');
      expect(result).toEqual(repos);
    });

    it('returns empty array after max retries on non-auth error', async () => {
      mockClient.get.mockRejectedValue({ response: { status: 500 } });
      const result = await service.getUserRepositories('user-token');
      expect(result).toEqual([]);
      expect(mockClient.get).toHaveBeenCalledTimes(3);
    });

    it('returns empty array when 401 and no refreshToken', async () => {
      mockClient.get.mockRejectedValue({ response: { status: 401 } });
      const result = await service.getUserRepositories('bad-token');
      expect(result).toEqual([]);
    });
  });

  // ── getStarredRepos ───────────────────────────────────────────────────────
  describe('getStarredRepos', () => {
    let setTimeoutSpy: jest.SpyInstance;

    beforeEach(() => {
      setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any; });
    });

    afterEach(() => {
      setTimeoutSpy.mockRestore();
    });

    it('returns starred repos on success', async () => {
      const repos = [{ id: 2, name: 'starred' }];
      mockClient.get.mockResolvedValue({ data: repos });
      const result = await service.getStarredRepos('token');
      expect(result).toEqual(repos);
    });

    it('returns empty array after max retries', async () => {
      mockClient.get.mockRejectedValue({ response: { status: 500 } });
      const result = await service.getStarredRepos('token');
      expect(result).toEqual([]);
      expect(mockClient.get).toHaveBeenCalledTimes(3);
    });

    it('throws after max retries when throwOnError is enabled', async () => {
      const error = { response: { status: 500 } };
      mockClient.get.mockRejectedValue(error);
      await expect(service.getStarredRepos('token', undefined, { throwOnError: true }))
        .rejects.toBe(error);
    });
  });

  // ── refreshGithubToken ────────────────────────────────────────────────────
  describe('refreshGithubToken', () => {
    it('always throws because GitHub does not support token refresh', async () => {
      await expect(service.refreshGithubToken('refresh-token')).rejects.toThrow('GitHub OAuth 不支持 token 刷新');
    });
  });

  // ── defaultClient uses server GITHUB_TOKEN when configured ────────────────
  it('sets Authorization header on defaultClient when GITHUB_TOKEN configured', () => {
    const configWithToken = { get: jest.fn().mockReturnValue('server-token') };
    service = new GithubService(configWithToken as any);
    const createCalls = mockAxios.create.mock.calls;
    const defaultClientCall = createCalls.find((call) =>
      getHeaders(call[0])?.Authorization === 'Bearer server-token',
    );
    expect(defaultClientCall).toBeDefined();
  });
});
