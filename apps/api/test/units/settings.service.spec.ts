import { SettingsService } from '../../src/modules/settings/settings.service';
import axios from 'axios';

const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();
const mockRepositoryCount = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP', WECOM: 'WECOM', WECHAT: 'WECHAT' },
  NotificationStatus: { PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED', READ: 'READ' },
  EventType: { PUSH: 'PUSH' },
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  prisma: {
    user: {
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
      update: (...a: any[]) => mockUserUpdate(...a),
    },
    repository: {
      count: (...a: any[]) => mockRepositoryCount(...a),
    },
  },
}));

jest.mock('axios');

const mockAxios = axios as jest.Mocked<typeof axios>;

function makeDbUser(overrides: object = {}) {
  return {
    aiProvider: 'openai',
    aiApiKey: 'real-key-123',
    aiBaseUrl: null,
    aiModel: 'gpt-4o',
    ...overrides,
  };
}

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.isAxiosError.mockImplementation((error: unknown) =>
      Boolean((error as { isAxiosError?: boolean } | null)?.isAxiosError),
    );
    service = new SettingsService();
  });

  describe('GitHub integration', () => {
    it('returns disconnected when no GitHub token exists', async () => {
      mockUserFindUnique.mockResolvedValue({ githubId: null, githubLogin: null, githubAccessToken: null });
      await expect(service.getGithubIntegrationStatus('u1')).resolves.toEqual({ connected: false });
    });

    it('validates and stores GitHub token without returning it', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { id: 123, login: 'alice', name: 'Alice', email: 'a@example.com', avatar_url: 'https://avatar' },
      });
      mockUserUpdate.mockResolvedValue({
        githubId: '123',
        githubLogin: 'alice',
        githubAccessToken: 'github_pat_secret1234',
      });

      const result = await service.updateGithubToken('u1', 'github_pat_secret1234');

      expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          githubId: '123',
          githubLogin: 'alice',
          githubAccessToken: 'github_pat_secret1234',
          githubRefreshToken: null,
        }),
      }));
      expect(result).toEqual({
        connected: true,
        githubId: '123',
        githubLogin: 'alice',
        tokenMasked: 'gith...1234',
      });
      expect(result).not.toHaveProperty('githubAccessToken');
    });

    it('stores GitHub token when profile validation has a transient network failure', async () => {
      mockAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        message: 'timeout of 10000ms exceeded',
        code: 'ECONNABORTED',
      });
      mockUserUpdate.mockResolvedValue({
        githubId: null,
        githubLogin: null,
        githubAccessToken: 'github_pat_secret1234',
      });

      const result = await service.updateGithubToken('u1', 'github_pat_secret1234');
      const callData = mockUserUpdate.mock.calls[0][0].data;

      expect(callData).toEqual(expect.objectContaining({
        githubAccessToken: 'github_pat_secret1234',
        githubRefreshToken: null,
      }));
      expect(callData).not.toHaveProperty('githubId');
      expect(callData).not.toHaveProperty('githubLogin');
      expect(result).toEqual({
        connected: true,
        tokenMasked: 'gith...1234',
      });
    });

    it('rejects invalid GitHub token without storing it', async () => {
      mockAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Request failed with status code 401',
        response: { status: 401, data: { message: 'Bad credentials' } },
      });

      await expect(service.updateGithubToken('u1', 'bad-token')).rejects.toThrow('Invalid GitHub token');
      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it('disconnects GitHub token and returns disconnected status', async () => {
      await expect(service.disconnectGithub('u1')).resolves.toEqual({ connected: false });
      expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({
          githubId: null,
          githubLogin: null,
          githubAccessToken: null,
          githubRefreshToken: null,
        }),
      }));
    });
  });

  describe('canUpdateApiUrlConfig', () => {
    it('allows users with editable repositories to update webhook API_URL', async () => {
      mockRepositoryCount.mockResolvedValue(1);

      await expect(service.canUpdateApiUrlConfig('u1')).resolves.toBe(true);

      expect(mockRepositoryCount).toHaveBeenCalledWith({
        where: {
          isActive: true,
          users: {
            some: {
              userId: 'u1',
              accessMode: 'EDITABLE',
            },
          },
        },
      });
    });

    it('rejects users without editable repositories', async () => {
      mockRepositoryCount.mockResolvedValue(0);

      await expect(service.canUpdateApiUrlConfig('u1')).resolves.toBe(false);
    });
  });

  // ── getAIConfig ────────────────────────────────────────────────────────────
  describe('getAIConfig', () => {
    it('returns empty object when user not found', async () => {
      mockUserFindUnique.mockResolvedValue(null);
      const result = await service.getAIConfig('u1');
      expect(result).toEqual({});
    });

    it('masks apiKey as *** when present', async () => {
      mockUserFindUnique.mockResolvedValue(makeDbUser());
      const result = await service.getAIConfig('u1');
      expect(result.aiApiKey).toBe('***');
      expect(result.aiProvider).toBe('openai');
      expect(result.aiModel).toBe('gpt-4o');
    });

    it('omits aiApiKey when not set', async () => {
      mockUserFindUnique.mockResolvedValue(makeDbUser({ aiApiKey: null }));
      const result = await service.getAIConfig('u1');
      expect(result.aiApiKey).toBeUndefined();
    });

    it('omits aiBaseUrl when not set', async () => {
      mockUserFindUnique.mockResolvedValue(makeDbUser({ aiBaseUrl: null }));
      const result = await service.getAIConfig('u1');
      expect(result.aiBaseUrl).toBeUndefined();
    });
  });

  // ── updateAIConfig ─────────────────────────────────────────────────────────
  describe('updateAIConfig', () => {
    it('updates provider and model', async () => {
      mockUserUpdate.mockResolvedValue(makeDbUser({ aiProvider: 'anthropic', aiModel: 'claude-3' }));
      const result = await service.updateAIConfig('u1', { aiProvider: 'anthropic' as any, aiModel: 'claude-3' });
      expect(result.aiProvider).toBe('anthropic');
      expect(mockUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ aiProvider: 'anthropic', aiModel: 'claude-3' }) }),
      );
    });

    it('does not write apiKey when value is masked ***', async () => {
      mockUserUpdate.mockResolvedValue(makeDbUser());
      await service.updateAIConfig('u1', { aiApiKey: '***' });
      const callData = mockUserUpdate.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty('aiApiKey');
    });

    it('does not write apiKey when value is empty string', async () => {
      mockUserUpdate.mockResolvedValue(makeDbUser());
      await service.updateAIConfig('u1', { aiApiKey: '' });
      const callData = mockUserUpdate.mock.calls[0][0].data;
      expect(callData).not.toHaveProperty('aiApiKey');
    });

    it('writes apiKey when a real value is provided', async () => {
      mockUserUpdate.mockResolvedValue(makeDbUser({ aiApiKey: 'sk-new' }));
      await service.updateAIConfig('u1', { aiApiKey: 'sk-new' });
      const callData = mockUserUpdate.mock.calls[0][0].data;
      expect(callData.aiApiKey).toBe('sk-new');
    });

    it('sets aiBaseUrl to null when empty string passed', async () => {
      mockUserUpdate.mockResolvedValue(makeDbUser({ aiBaseUrl: null }));
      await service.updateAIConfig('u1', { aiBaseUrl: '' });
      const callData = mockUserUpdate.mock.calls[0][0].data;
      expect(callData.aiBaseUrl).toBeNull();
    });
  });

  // ── resolveApiKey ──────────────────────────────────────────────────────────
  describe('resolveApiKey', () => {
    it('returns actual key from DB when passed ***', async () => {
      mockUserFindUnique.mockResolvedValue({ aiApiKey: 'real-key' });
      const key = await service.resolveApiKey('u1', '***');
      expect(key).toBe('real-key');
    });

    it('returns empty string when DB has no key and *** passed', async () => {
      mockUserFindUnique.mockResolvedValue({ aiApiKey: null });
      const key = await service.resolveApiKey('u1', '***');
      expect(key).toBe('');
    });

    it('returns the value directly when not masked', async () => {
      const key = await service.resolveApiKey('u1', 'sk-direct');
      expect(key).toBe('sk-direct');
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });
  });
});
