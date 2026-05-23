import { ImService } from '../../src/modules/im/im.service';

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

jest.mock('axios');

function makePrefs(im: object = {}) {
  return { preferences: { im } };
}

describe('ImService', () => {
  let service: ImService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
});
