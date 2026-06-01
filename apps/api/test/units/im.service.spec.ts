import { ImService } from '../../src/modules/im/im.service';

const mockWecomSendMessage = jest.fn();
const mockWecomReplyStream = jest.fn();
const mockWecomReplyWelcome = jest.fn();
const mockWecomHandlers: Record<string, Array<(...args: any[]) => void>> = {};

const mockUserFindUnique = jest.fn();
const mockUserFindMany = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock('@wecom/aibot-node-sdk', () => {
  class MockWSClient {
    on(event: string, handler: (...args: any[]) => void) {
      mockWecomHandlers[event] = [...(mockWecomHandlers[event] || []), handler];
      return this;
    }

    connect() {
      for (const handler of mockWecomHandlers.authenticated || []) handler();
      return this;
    }

    disconnect() {}

    sendMessage = mockWecomSendMessage;
    replyStream = mockWecomReplyStream;
    replyWelcome = mockWecomReplyWelcome;
  }

  return {
    __esModule: true,
    default: { WSClient: MockWSClient },
    WSClient: MockWSClient,
    generateReqId: jest.fn(() => 'stream-id'),
  };
});

jest.mock('@repo-pulse/database', () => ({
  prisma: {
    user: {
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
      findMany: (...a: any[]) => mockUserFindMany(...a),
      update: (...a: any[]) => mockUserUpdate(...a),
    },
  },
}));

jest.mock('axios');

function makePrefs(im: object = {}) {
  return { preferences: { im } };
}

describe('ImService', () => {
  let service: ImService;

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockWecomHandlers)) {
      delete mockWecomHandlers[key];
    }
    mockWecomSendMessage.mockResolvedValue({ headers: { req_id: 'ack' } });
    mockWecomReplyStream.mockResolvedValue({ headers: { req_id: 'reply-ack' } });
    mockWecomReplyWelcome.mockResolvedValue({ headers: { req_id: 'welcome-ack' } });
    // onModuleInit calls restoreFeishuBridges → prisma.user.findMany
    mockUserFindMany.mockResolvedValue([]);
    service = new ImService();
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  // ── handleFeishuEvent — challenge ─────────────────────────────────────────
  it('returns challenge when challenge field present', async () => {
    const result = await service.handleFeishuEvent({ challenge: 'abc123' });
    expect(result).toEqual({ challenge: 'abc123' });
  });

  it('ignores encrypted payloads', async () => {
    const result = await service.handleFeishuEvent({ encrypt: 'encrypted-data' });
    expect(result).toMatchObject({ ok: true, ignored: true, reason: 'encrypted_payload_not_supported' });
  });

  it('ignores non-message event types', async () => {
    const result = await service.handleFeishuEvent({
      header: { event_type: 'im.chat.updated_v1' },
    });
    expect(result).toMatchObject({ ok: true, ignored: true });
  });

  it('ignores message events with no bind code in text', async () => {
    const result = await service.handleFeishuEvent({
      header: { event_type: 'im.message.receive_v1' },
      event: {
        message: { message_type: 'text', content: JSON.stringify({ text: 'hello' }), chat_id: 'c1' },
        sender: { sender_id: { open_id: 'o1' } },
      },
    });
    expect(result).toMatchObject({ ok: true, ignored: true });
  });

  // ── handleFeishuEvent — bind code extraction ──────────────────────────────
  it('attempts binding when /bind CODE found in message', async () => {
    mockUserFindMany.mockResolvedValue([]);
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
    // No valid code match → returns not found
    expect(result).toMatchObject({ ok: false });
  });

  // ── sendRepositoryEventNotification — short-circuits ─────────────────────
  it('returns feishu_not_configured when feishu not set', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
    const result = await service.sendRepositoryEventNotification('u1', {
      eventId: 'e1', repositoryId: 'r1', repositoryName: 'org/repo',
      eventType: 'PUSH', title: 'push', content: 'body', author: 'bot',
    });
    expect(result).toEqual({ sent: 0, skippedReason: 'feishu_not_configured' });
  });

  it('returns feishu_chat_not_bound when no chat bindings match', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({
      feishu: { appId: 'aid', appSecret: 'sec' },
      subscriptions: [],
      bindings: [],
    }));
    const result = await service.sendRepositoryEventNotification('u1', {
      eventId: 'e1', repositoryId: 'r1', repositoryName: 'org/repo',
      eventType: 'PUSH', title: 'push', content: 'body', author: 'bot',
    });
    expect(result).toEqual({ sent: 0, skippedReason: 'feishu_chat_not_bound' });
  });

  // ── sendFeishuTestNotification — short-circuits ───────────────────────────
  it('returns not configured message when feishu not set', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
    const result = await service.sendFeishuTestNotification('u1');
    expect(result).toMatchObject({ sent: 0, message: '飞书机器人未配置。' });
  });

  it('returns no chat bound message when no bindings', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({
      feishu: { appId: 'aid', appSecret: 'sec' },
      subscriptions: [],
      bindings: [],
    }));
    const result = await service.sendFeishuTestNotification('u1');
    expect(result).toMatchObject({ sent: 0, message: '还没有绑定飞书群聊。' });
  });

  // ── listSubscriptions ─────────────────────────────────────────────────────
  it('returns empty array when no subscriptions configured', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
    const subs = await service.listSubscriptions('u1');
    expect(subs).toEqual([]);
  });

  it('returns configured subscriptions', async () => {
    const subs = [{ id: 's1', chatId: 'c1', enabled: true, repositoryIds: [], branches: [], events: [], repositoryBranchScopes: {} }];
    mockUserFindUnique.mockResolvedValue(makePrefs({ subscriptions: subs }));
    const result = await service.listSubscriptions('u1');
    expect(result).toEqual(subs);
  });

  it('filters subscriptions by provider while keeping legacy subscriptions as feishu', async () => {
    const subs = [
      { id: 's1', chatId: 'c1', enabled: true, repositoryIds: [], branches: [], events: [], repositoryBranchScopes: {} },
      { id: 's2', provider: 'dingtalk', chatId: 'c2', enabled: true, repositoryIds: [], branches: [], events: [], repositoryBranchScopes: {} },
    ];
    mockUserFindUnique.mockResolvedValue(makePrefs({ subscriptions: subs }));
    await expect(service.listSubscriptions('u1', 'feishu')).resolves.toEqual([subs[0]]);
    await expect(service.listSubscriptions('u1', 'dingtalk')).resolves.toEqual([subs[1]]);
  });

  // ── saveSubscriptions — normalizes data ───────────────────────────────────
  it('deduplicates repositoryIds and branches', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
    mockUserUpdate.mockResolvedValue({});
    const result = await service.saveSubscriptions('u1', [
      {
        id: 's1', chatId: 'c1', enabled: true, chatName: 'chat',
        repositoryIds: ['r1', 'r1', 'r2'],
        branches: ['main', 'main'],
        repositoryBranchScopes: {},
        events: ['PUSH', 'PUSH'],
      },
    ]);
    expect(result[0].repositoryIds).toEqual(['r1', 'r2']);
    expect(result[0].branches).toEqual(['main']);
    expect(result[0].events).toEqual(['PUSH']);
  });

  it('saves provider subscriptions without replacing other providers', async () => {
    const feishuSub = { id: 'f1', provider: 'feishu', chatId: 'cf', enabled: true, repositoryIds: [], branches: [], events: [], repositoryBranchScopes: {} };
    mockUserFindUnique.mockResolvedValue(makePrefs({ subscriptions: [feishuSub] }));
    mockUserUpdate.mockResolvedValue({});
    const result = await service.saveSubscriptions('u1', 'dingtalk', [
      {
        id: 'd1', chatId: 'cd', enabled: true,
        repositoryIds: ['r1'],
        branches: [],
        repositoryBranchScopes: {},
        events: ['PUSH'],
      },
    ]);
    expect(result[0].provider).toBe('dingtalk');
    const saved = mockUserUpdate.mock.calls[0][0].data.preferences.im.subscriptions;
    expect(saved).toEqual([feishuSub, result[0]]);
  });

  // ── createPairingCode ─────────────────────────────────────────────────────
  it('creates a pairing code and returns it with expiry', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
    mockUserUpdate.mockResolvedValue({});
    const result = await service.createPairingCode('u1');
    expect(result.code).toMatch(/^[A-F0-9]{8}$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('keeps only non-expired codes when creating new one', async () => {
    const expiredCode = { code: 'OLD0', provider: 'feishu', userId: 'u1', expiresAt: new Date(0).toISOString(), createdAt: '' };
    mockUserFindUnique.mockResolvedValue(makePrefs({ pairingCodes: [expiredCode] }));
    mockUserUpdate.mockResolvedValue({});
    await service.createPairingCode('u1');
    const saved = mockUserUpdate.mock.calls[0][0].data.preferences.im.pairingCodes;
    expect(saved.every((c: any) => c.code !== 'OLD0')).toBe(true);
  });

  it('creates provider-specific pairing codes', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
    mockUserUpdate.mockResolvedValue({});
    await service.createPairingCode('u1', 'dingtalk');
    const saved = mockUserUpdate.mock.calls[0][0].data.preferences.im.pairingCodes;
    expect(saved[0].provider).toBe('dingtalk');
  });

  it('sends wecom test notification through the Bot WebSocket channel', async () => {
    mockUserFindUnique.mockResolvedValue(makePrefs({
      wecom: { botId: 'bot-1', secret: 'sec-1', state: 'connected' },
      bindings: [{ provider: 'wecom', openId: 'user-1', chatId: 'chat-1', boundAt: '' }],
    }));
    mockUserUpdate.mockResolvedValue({});

    const result = await service.sendWecomTestNotification('u1');

    expect(result.sent).toBe(1);
    expect(mockWecomSendMessage).toHaveBeenCalledWith(
      'chat-1',
      expect.objectContaining({
        msgtype: 'markdown',
        markdown: expect.objectContaining({ content: expect.stringContaining('Repo-Pulse') }),
      }),
    );
  });

  it('binds wecom chat when a Bot WebSocket text message contains a valid pairing code', async () => {
    const futureExpiry = new Date(Date.now() + 60000).toISOString();
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
    mockUserUpdate.mockResolvedValue({});

    await service.saveWecomConnection('u1', { botId: 'bot-1', secret: 'sec-1' });

    mockUserFindMany.mockResolvedValueOnce([{
      id: 'u1',
      preferences: {
        im: {
          wecom: { botId: 'bot-1', secret: 'sec-1', state: 'connected' },
          pairingCodes: [{ code: 'WECOM123', provider: 'wecom', userId: 'u1', expiresAt: futureExpiry, createdAt: '' }],
        },
      },
    }]);

    const frame = {
      headers: { req_id: 'req-1' },
      body: {
        msgid: 'msg-1',
        aibotid: 'bot-1',
        chatid: 'chat-1',
        chattype: 'group',
        from: { userid: 'user-1' },
        msgtype: 'text',
        text: { content: '/bind WECOM123' },
      },
    };

    for (const handler of mockWecomHandlers.message || []) handler(frame);
    await new Promise((resolve) => setImmediate(resolve));

    const saved = mockUserUpdate.mock.calls
      .map((call) => call[0].data.preferences.im)
      .find((im) => im.bindings?.[0]?.provider === 'wecom');
    expect(saved).toBeDefined();
    expect(saved?.bindings[0]).toMatchObject({ provider: 'wecom', openId: 'user-1', chatId: 'chat-1' });
    expect(mockWecomReplyStream).toHaveBeenCalledWith(
      frame,
      'stream-id',
      expect.stringContaining('绑定成功'),
      true,
    );
  });
});
