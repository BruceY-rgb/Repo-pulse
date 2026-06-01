import { SettingsService } from '../../src/modules/settings/settings.service';

const mockUserFindUnique = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  prisma: {
    user: {
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
      update: (...a: any[]) => mockUserUpdate(...a),
    },
  },
}));

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
    service = new SettingsService();
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
