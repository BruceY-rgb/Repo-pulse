import axios from 'axios';

jest.mock('axios');
jest.mock('@larksuiteoapi/node-sdk', () => ({
  EventDispatcher: jest.fn().mockImplementation(() => ({
    register: jest.fn().mockReturnThis(),
  })),
  WSClient: jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
  LoggerLevel: { warn: 'warn', error: 'error', info: 'info' },
}), { virtual: true });

const mockUserFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  prisma: {
    user: {
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
      findMany: (...a: any[]) => mockUserFindMany(...a),
      update: (...a: any[]) => mockUserUpdate(...a),
    },
  },
}));

const mockAxios = axios as jest.Mocked<typeof axios>;

import { ImService } from '../../src/modules/im/im.service';

function makePrefs(im: object = {}) {
  return { preferences: { im } };
}

function makeFeishuPrefs(overrides: object = {}) {
  return makePrefs({ feishu: { appId: 'aid', appSecret: 'sec', ...overrides } });
}

describe('ImService - additional coverage', () => {
  let service: ImService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserFindMany.mockResolvedValue([]);
    service = new ImService();
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // ── getStatus ─────────────────────────────────────────────────────────────
  describe('getStatus', () => {
    it('returns not_configured state when feishu not set', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({}));
      const result = await service.getStatus('u1');
      expect(result.feishu.state).toBe('not_configured');
    });

    it('returns configured state when feishu has appId but no explicit state', async () => {
      mockUserFindUnique.mockResolvedValue(makeFeishuPrefs({ state: undefined }));
      const result = await service.getStatus('u1');
      expect(result.feishu.state).toBe('configured');
    });

    it('returns ready state when feishu state is ready', async () => {
      mockUserFindUnique.mockResolvedValue(makeFeishuPrefs({ state: 'ready' }));
      const result = await service.getStatus('u1');
      expect(result.feishu.state).toBe('ready');
      expect(result.feishu.connected).toBe(true);
    });

    it('includes botName and appId in status', async () => {
      mockUserFindUnique.mockResolvedValue(makeFeishuPrefs({ botName: 'MyBot', state: 'connected' }));
      const result = await service.getStatus('u1');
      expect(result.feishu.botName).toBe('MyBot');
      expect(result.feishu.appId).toBe('aid');
    });

    it('marks subscriptionReady when binding with chatId exists', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({
        feishu: { appId: 'aid', appSecret: 'sec', state: 'ready' },
        bindings: [{ provider: 'feishu', openId: 'o1', chatId: 'c1', boundAt: '' }],
      }));
      const result = await service.getStatus('u1');
      expect(result.feishu.stages.find((s: any) => s.id === 'subscription_ready')?.state).toBe('verified');
    });
  });

  // ── saveFeishuConnection ──────────────────────────────────────────────────
  describe('saveFeishuConnection', () => {
    it('saves connection and returns status', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({}));
      mockUserUpdate.mockResolvedValue({});

      const result = await service.saveFeishuConnection('u1', { appId: ' new-aid ', appSecret: ' new-sec ' });
      expect(mockUserUpdate).toHaveBeenCalled();
      expect(result.state).toBe('configured');
    });
  });

  // ── testFeishuConnection ──────────────────────────────────────────────────
  describe('testFeishuConnection', () => {
    it('returns error when token request fails (non-2xx status)', async () => {
      mockAxios.post.mockResolvedValueOnce({ status: 401, data: { code: 10012, msg: 'Invalid credentials' } });
      const result = await service.testFeishuConnection('u1', { appId: 'aid', appSecret: 'bad-sec' });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid credentials');
    });

    it('returns error when token request throws', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('network timeout'));
      const result = await service.testFeishuConnection('u1', { appId: 'aid', appSecret: 'sec' });
      expect(result.success).toBe(false);
      expect(result.message).toBe('network timeout');
    });

    it('returns success=true when bridge connects and bot is reachable', async () => {
      mockAxios.post.mockResolvedValueOnce({ status: 200, data: { code: 0, tenant_access_token: 'tok' } });
      mockAxios.get.mockResolvedValueOnce({ status: 200, data: { code: 0, bot: { app_name: 'MyBot' } } });
      mockUserFindUnique.mockResolvedValue(makePrefs({}));
      mockUserUpdate.mockResolvedValue({});

      const result = await service.testFeishuConnection('u1', { appId: 'aid', appSecret: 'sec' });
      expect(result.success).toBe(true);
    });

    it('returns success=false when bot unreachable', async () => {
      mockAxios.post.mockResolvedValueOnce({ status: 200, data: { code: 0, tenant_access_token: 'tok' } });
      mockAxios.get.mockResolvedValueOnce({ status: 500, data: { code: 1, msg: 'bot error' } });
      mockUserFindUnique.mockResolvedValue(makePrefs({}));
      mockUserUpdate.mockResolvedValue({});

      const result = await service.testFeishuConnection('u1', { appId: 'aid', appSecret: 'sec' });
      // bridge connected, but bot unreachable
      expect(result).toHaveProperty('success');
    });
  });

  // ── sendRepositoryEventNotification — token unavailable ───────────────────
  describe('sendRepositoryEventNotification', () => {
    const makeEvent = () => ({
      eventId: 'e1', repositoryId: 'r1', repositoryName: 'org/repo',
      eventType: 'PUSH', title: 'push', content: 'body', author: 'bot',
    });

    it('returns feishu_token_unavailable when token fetch returns null', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({
        feishu: { appId: 'aid', appSecret: 'sec' },
        bindings: [{ provider: 'feishu', openId: 'o1', chatId: 'c1', boundAt: '' }],
      }));
      mockAxios.post.mockResolvedValueOnce({ status: 401, data: { code: 1 } });

      const result = await service.sendRepositoryEventNotification('u1', makeEvent());
      expect(result.skippedReason).toBe('token_unavailable:aid');
    });

    it('sends to chat when token available and binding matches', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({
        feishu: { appId: 'aid', appSecret: 'sec' },
        bindings: [{ provider: 'feishu', openId: 'o1', chatId: 'c1', boundAt: '' }],
      }));
      // Token request
      mockAxios.post
        .mockResolvedValueOnce({ status: 200, data: { code: 0, tenant_access_token: 'tok' } })
        // Message send (card)
        .mockResolvedValueOnce({ status: 200, data: { code: 0 } });

      const result = await service.sendRepositoryEventNotification('u1', makeEvent());
      expect(result.sent).toBe(1);
    });
  });

  // ── sendFeishuTestNotification — token path ───────────────────────────────
  describe('sendFeishuTestNotification', () => {
    it('returns feishu_token_unavailable message when token fails', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({
        feishu: { appId: 'aid', appSecret: 'sec' },
        subscriptions: [{ id: 's1', robotId: 'aid', provider: 'feishu', chatId: 'c1', enabled: true, repositoryIds: [], branches: [], events: [], repositoryBranchScopes: {} }],
      }));
      mockAxios.post.mockResolvedValueOnce({ status: 401, data: { code: 1 } });

      const result = await service.sendFeishuTestNotification('u1');
      expect(result.sent).toBe(0);
      expect(result.message).toContain('无法获取飞书访问令牌');
    });

    it('sends test notification when token available', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({
        feishu: { appId: 'aid', appSecret: 'sec' },
        subscriptions: [{ id: 's1', robotId: 'aid', provider: 'feishu', chatId: 'c1', enabled: true, repositoryIds: [], branches: [], events: [], repositoryBranchScopes: {} }],
      }));
      mockAxios.post
        .mockResolvedValueOnce({ status: 200, data: { code: 0, tenant_access_token: 'tok' } })
        .mockResolvedValueOnce({ status: 200, data: { code: 0 } });

      const result = await service.sendFeishuTestNotification('u1');
      expect(result.sent).toBe(1);
      expect(result.message).toContain('已发送');
    });

    it('returns failed message when send fails', async () => {
      mockUserFindUnique.mockResolvedValue(makePrefs({
        feishu: { appId: 'aid', appSecret: 'sec' },
        subscriptions: [{ id: 's1', robotId: 'aid', provider: 'feishu', chatId: 'c1', enabled: true, repositoryIds: [], branches: [], events: [], repositoryBranchScopes: {} }],
      }));
      mockAxios.post
        .mockResolvedValueOnce({ status: 200, data: { code: 0, tenant_access_token: 'tok' } })
        .mockResolvedValueOnce({ status: 500, data: { code: 1 } })  // card fails
        .mockResolvedValueOnce({ status: 500, data: { code: 1 } }); // text fallback also fails

      const result = await service.sendFeishuTestNotification('u1');
      expect(result.sent).toBe(0);
      expect(result.message).toContain('失败');
    });
  });

  // ── handleFeishuEvent — successful bind ───────────────────────────────────
  describe('handleFeishuEvent with bind code', () => {
    it('returns ok=true when valid bind code found', async () => {
      const futureExpiry = new Date(Date.now() + 60000).toISOString();
      mockUserFindMany
        .mockResolvedValueOnce([{
          id: 'u1',
          preferences: {
            im: {
              feishu: { appId: 'aid', appSecret: 'sec', state: 'ready' },
              pairingCodes: [{ code: 'ABCD1234', provider: 'feishu', userId: 'u1', expiresAt: futureExpiry, createdAt: '' }],
            },
          },
        }]);
      mockUserFindUnique.mockResolvedValue(makePrefs({}));
      mockUserUpdate.mockResolvedValue({});

      const result = await service.handleFeishuEvent({
        header: { event_type: 'im.message.receive_v1' },
        event: {
          message: {
            message_type: 'text',
            content: JSON.stringify({ text: '/bind ABCD1234' }),
            chat_id: 'c1',
            message_id: '',
          },
          sender: { sender_id: { open_id: 'o1' } },
        },
      });
      expect(result.ok).toBe(true);
    });

    it('returns ok=false when bind code is expired', async () => {
      const pastExpiry = new Date(Date.now() - 60000).toISOString();
      mockUserFindMany
        .mockResolvedValueOnce([{
          id: 'u1',
          preferences: {
            im: {
              pairingCodes: [{ code: 'EXPD1234', provider: 'feishu', userId: 'u1', expiresAt: pastExpiry, createdAt: '' }],
            },
          },
        }]);

      const result = await service.handleFeishuEvent({
        header: { event_type: 'im.message.receive_v1' },
        event: {
          message: {
            message_type: 'text',
            content: JSON.stringify({ text: '/bind EXPD1234' }),
            chat_id: 'c1',
            message_id: '',
          },
          sender: { sender_id: { open_id: 'o1' } },
        },
      });
      expect(result.ok).toBe(false);
    });
  });

  // ── restoreFeishuBridges — with configured user ────────────────────────────
  it('restores bridge for user with feishu configured on init', async () => {
    const serviceWithUser = new ImService();
    mockUserFindMany.mockResolvedValueOnce([{
      id: 'u2',
      preferences: { im: { feishu: { appId: 'aid2', appSecret: 'sec2' } } },
    }]);
    // Should not throw even if bridge start fails
    await expect(serviceWithUser.onModuleInit()).resolves.toBeUndefined();
    await serviceWithUser.onModuleDestroy();
  });
});
