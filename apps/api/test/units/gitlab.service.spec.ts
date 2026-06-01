import axios from 'axios';
import { GitlabService } from '../../src/modules/repository/services/gitlab.service';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

function getHeaders(call: Parameters<typeof mockAxios.create>[0]) {
  return call?.headers as Record<string, unknown> | undefined;
}

describe('GitlabService', () => {
  let service: GitlabService;
  let mockClient: { get: jest.Mock; post: jest.Mock; delete: jest.Mock };
  let mockConfigService: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
    mockAxios.create = jest.fn().mockReturnValue(mockClient as any);
    mockConfigService = { get: jest.fn().mockReturnValue(undefined) };
    service = new GitlabService(mockConfigService as any);
  });

  // ── constructor ────────────────────────────────────────────────────────────
  it('creates axios client without PRIVATE-TOKEN when no token configured', () => {
    const call = mockAxios.create.mock.calls[0][0];
    expect(getHeaders(call)?.['PRIVATE-TOKEN']).toBeUndefined();
  });

  it('sets PRIVATE-TOKEN header when GITLAB_TOKEN configured', () => {
    const configWithToken = { get: jest.fn().mockReturnValue('gl-token') };
    service = new GitlabService(configWithToken as any);
    const createCalls = mockAxios.create.mock.calls;
    const tokenCall = createCalls.find((c) => getHeaders(c[0])?.['PRIVATE-TOKEN'] === 'gl-token');
    expect(tokenCall).toBeDefined();
  });

  // ── getRepository ─────────────────────────────────────────────────────────
  describe('getRepository', () => {
    it('returns repo data on success', async () => {
      const repoData = { id: 1, name: 'repo', path_with_namespace: 'org/repo', web_url: 'url', default_branch: 'main' };
      mockClient.get.mockResolvedValue({ data: repoData });
      const result = await service.getRepository('org', 'repo');
      expect(result).toBe(repoData);
    });

    it('calls correct encoded path', async () => {
      mockClient.get.mockResolvedValue({ data: {} });
      await service.getRepository('my-org', 'my-repo');
      const encodedPath = encodeURIComponent('my-org/my-repo');
      expect(mockClient.get).toHaveBeenCalledWith(`/projects/${encodedPath}`);
    });

    it('throws descriptive error on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      await expect(service.getRepository('org', 'missing')).rejects.toThrow('无法获取仓库 org/missing');
    });
  });

  // ── createWebhook ─────────────────────────────────────────────────────────
  describe('createWebhook', () => {
    it('returns webhook ID on success', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 55 } });
      const result = await service.createWebhook('org', 'repo', 'https://hook.url', 'secret');
      expect(result).toBe(55);
    });

    it('sends correct webhook payload', async () => {
      mockClient.post.mockResolvedValue({ data: { id: 77 } });
      await service.createWebhook('org', 'repo', 'https://hook.url', 'my-token');
      const [path, payload] = mockClient.post.mock.calls[0];
      const encodedPath = encodeURIComponent('org/repo');
      expect(path).toBe(`/projects/${encodedPath}/hooks`);
      expect(payload.url).toBe('https://hook.url');
      expect(payload.token).toBe('my-token');
      expect(payload.push_events).toBe(true);
      expect(payload.merge_requests_events).toBe(true);
      expect(payload.issues_events).toBe(true);
    });

    it('throws on failure', async () => {
      mockClient.post.mockRejectedValue(new Error('403'));
      await expect(service.createWebhook('org', 'repo', 'url', 'secret')).rejects.toThrow('创建 Webhook 失败');
    });
  });

  // ── deleteWebhook ─────────────────────────────────────────────────────────
  describe('deleteWebhook', () => {
    it('calls DELETE endpoint with correct path', async () => {
      mockClient.delete.mockResolvedValue({});
      await service.deleteWebhook('org', 'repo', 42);
      const encodedPath = encodeURIComponent('org/repo');
      expect(mockClient.delete).toHaveBeenCalledWith(`/projects/${encodedPath}/hooks/42`);
    });

    it('does not throw on failure', async () => {
      mockClient.delete.mockRejectedValue(new Error('404'));
      await expect(service.deleteWebhook('org', 'repo', 99)).resolves.toBeUndefined();
    });
  });

  // ── getCommits ────────────────────────────────────────────────────────────
  describe('getCommits', () => {
    it('returns commits on success', async () => {
      const commits = [{ id: 'abc', message: 'fix' }];
      mockClient.get.mockResolvedValue({ data: commits });
      const result = await service.getCommits('org', 'repo');
      expect(result).toBe(commits);
    });

    it('passes branch as ref_name param', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getCommits('org', 'repo', { branch: 'main' });
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: expect.objectContaining({ ref_name: 'main' }) }),
      );
    });

    it('passes since and until params', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getCommits('org', 'repo', { since: '2024-01-01', until: '2024-12-31' });
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { since: '2024-01-01', until: '2024-12-31' } }),
      );
    });

    it('omits absent optional params', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getCommits('org', 'repo', {});
      const params = mockClient.get.mock.calls[0][1].params;
      expect(params.ref_name).toBeUndefined();
      expect(params.since).toBeUndefined();
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
      const commit = { id: 'sha1', message: 'fix' };
      mockClient.get.mockResolvedValue({ data: commit });
      const result = await service.getCommit('org', 'repo', 'sha1');
      expect(result).toBe(commit);
    });

    it('encodes sha in URL', async () => {
      mockClient.get.mockResolvedValue({ data: {} });
      await service.getCommit('org', 'repo', 'abc/def');
      const url = mockClient.get.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent('abc/def'));
    });

    it('returns null on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      const result = await service.getCommit('org', 'repo', 'bad-sha');
      expect(result).toBeNull();
    });
  });

  // ── getBranches ───────────────────────────────────────────────────────────
  describe('getBranches', () => {
    it('maps branches to BranchInfo format', async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { name: 'main', protected: true, commit: { id: 'sha1' } },
          { name: 'dev', protected: false, commit: { id: 'sha2' } },
        ],
      });
      const result = await service.getBranches('org', 'repo');
      expect(result).toEqual([
        { name: 'main', isProtected: true, lastCommitSha: 'sha1' },
        { name: 'dev', isProtected: false, lastCommitSha: 'sha2' },
      ]);
    });

    it('filters branches with empty names', async () => {
      mockClient.get.mockResolvedValue({
        data: [
          { name: '', protected: false },
          { name: 'main', protected: false, commit: { id: 'sha' } },
        ],
      });
      const result = await service.getBranches('org', 'repo');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('main');
    });

    it('passes per_page: 100 param', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getBranches('org', 'repo');
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { per_page: 100 } }),
      );
    });

    it('handles branch without commit', async () => {
      mockClient.get.mockResolvedValue({
        data: [{ name: 'orphan', protected: false }],
      });
      const result = await service.getBranches('org', 'repo');
      expect(result[0].lastCommitSha).toBeUndefined();
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('403'));
      const result = await service.getBranches('org', 'repo');
      expect(result).toEqual([]);
    });
  });

  // ── getMergeRequests ──────────────────────────────────────────────────────
  describe('getMergeRequests', () => {
    it('returns MRs on success', async () => {
      const mrs = [{ id: 1, iid: 1, title: 'MR' }];
      mockClient.get.mockResolvedValue({ data: mrs });
      const result = await service.getMergeRequests('org', 'repo');
      expect(result).toBe(mrs);
    });

    it('passes state param', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getMergeRequests('org', 'repo', 'opened');
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { state: 'opened' } }),
      );
    });

    it('defaults state to all', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getMergeRequests('org', 'repo');
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { state: 'all' } }),
      );
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('500'));
      expect(await service.getMergeRequests('org', 'repo')).toEqual([]);
    });
  });

  // ── getMergeRequest ───────────────────────────────────────────────────────
  describe('getMergeRequest', () => {
    it('returns MR data on success', async () => {
      const mr = { id: 10, iid: 3, title: 'MR' };
      mockClient.get.mockResolvedValue({ data: mr });
      const result = await service.getMergeRequest('org', 'repo', 3);
      expect(result).toBe(mr);
    });

    it('calls correct endpoint with iid', async () => {
      mockClient.get.mockResolvedValue({ data: {} });
      await service.getMergeRequest('org', 'repo', 7);
      const encodedPath = encodeURIComponent('org/repo');
      expect(mockClient.get).toHaveBeenCalledWith(`/projects/${encodedPath}/merge_requests/7`);
    });

    it('returns null on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      expect(await service.getMergeRequest('org', 'repo', 999)).toBeNull();
    });
  });

  // ── getIssues ─────────────────────────────────────────────────────────────
  describe('getIssues', () => {
    it('returns issues on success', async () => {
      const issues = [{ id: 1, iid: 1, title: 'Bug' }];
      mockClient.get.mockResolvedValue({ data: issues });
      const result = await service.getIssues('org', 'repo');
      expect(result).toBe(issues);
    });

    it('passes state param', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getIssues('org', 'repo', 'closed');
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { state: 'closed' } }),
      );
    });

    it('defaults state to all', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await service.getIssues('org', 'repo');
      expect(mockClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ params: { state: 'all' } }),
      );
    });

    it('returns empty array on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('500'));
      expect(await service.getIssues('org', 'repo')).toEqual([]);
    });
  });

  // ── getIssue ──────────────────────────────────────────────────────────────
  describe('getIssue', () => {
    it('returns issue data on success', async () => {
      const issue = { id: 20, iid: 5, title: 'Issue' };
      mockClient.get.mockResolvedValue({ data: issue });
      const result = await service.getIssue('org', 'repo', 5);
      expect(result).toBe(issue);
    });

    it('calls correct endpoint with iid', async () => {
      mockClient.get.mockResolvedValue({ data: {} });
      await service.getIssue('org', 'repo', 12);
      const encodedPath = encodeURIComponent('org/repo');
      expect(mockClient.get).toHaveBeenCalledWith(`/projects/${encodedPath}/issues/12`);
    });

    it('returns null on failure', async () => {
      mockClient.get.mockRejectedValue(new Error('404'));
      expect(await service.getIssue('org', 'repo', 999)).toBeNull();
    });
  });
});
