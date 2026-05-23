const mockNotificationCreate = jest.fn();
const mockNotificationUpdate = jest.fn();
const mockNotificationFindMany = jest.fn();
const mockNotificationCount = jest.fn();
const mockNotificationFindFirst = jest.fn();
const mockNotificationUpdateMany = jest.fn();
const mockNotificationDelete = jest.fn();
const mockUserFindUnique = jest.fn();
const mockUserRepoFindMany = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  NotificationChannel: {
    IN_APP: 'IN_APP', EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK',
  },
  NotificationStatus: { PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED' },
  prisma: {
    notification: {
      create: (...a: any[]) => mockNotificationCreate(...a),
      update: (...a: any[]) => mockNotificationUpdate(...a),
      findMany: (...a: any[]) => mockNotificationFindMany(...a),
      count: (...a: any[]) => mockNotificationCount(...a),
      findFirst: (...a: any[]) => mockNotificationFindFirst(...a),
      updateMany: (...a: any[]) => mockNotificationUpdateMany(...a),
      delete: (...a: any[]) => mockNotificationDelete(...a),
    },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    userRepository: { findMany: (...a: any[]) => mockUserRepoFindMany(...a) },
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from '@modules/notification/notification.service';
import { EmailChannel } from '@modules/notification/channels/email.channel';
import { DingTalkChannel } from '@modules/notification/channels/dingtalk.channel';
import { FeishuChannel } from '@modules/notification/channels/feishu.channel';
import { WebhookChannel } from '@modules/notification/channels/webhook.channel';

async function makeService(channelMocks: { email?: any; dingtalk?: any; feishu?: any; webhook?: any } = {}) {
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      NotificationService,
      { provide: EmailChannel, useValue: channelMocks.email ?? { send: jest.fn().mockResolvedValue({ success: true }) } },
      { provide: DingTalkChannel, useValue: channelMocks.dingtalk ?? { send: jest.fn().mockResolvedValue({ success: true }) } },
      { provide: FeishuChannel, useValue: channelMocks.feishu ?? { send: jest.fn().mockResolvedValue({ success: true }) } },
      { provide: WebhookChannel, useValue: channelMocks.webhook ?? { send: jest.fn().mockResolvedValue({ success: true }) } },
    ],
  }).compile();
  return moduleRef.get(NotificationService);
}

function makePendingNotif(id = 'n1') {
  return { id, status: 'PENDING', metadata: {}, sentAt: null, readAt: null };
}

describe('NotificationService - additional channels and query methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationCreate.mockResolvedValue(makePendingNotif());
    mockNotificationUpdate.mockResolvedValue(makePendingNotif());
    mockUserFindUnique.mockResolvedValue({ preferences: {} });
  });

  const makeSendDto = (channel: string) => ({
    userId: 'u1', channel: channel as any, title: 'Test', content: 'Body',
  });

  // ── WEBHOOK channel ───────────────────────────────────────────────────────
  it('sends via WEBHOOK channel and returns SENT', async () => {
    const service = await makeService();
    const result = await service.send(makeSendDto('WEBHOOK'));
    expect(result.status).toBe('SENT');
  });

  it('sends via DINGTALK channel and returns SENT', async () => {
    const service = await makeService();
    const result = await service.send(makeSendDto('DINGTALK'));
    expect(result.status).toBe('SENT');
  });

  it('sends via FEISHU channel and returns SENT', async () => {
    const service = await makeService();
    const result = await service.send(makeSendDto('FEISHU'));
    expect(result.status).toBe('SENT');
  });

  it('returns FAILED for unknown channel', async () => {
    const service = await makeService();
    const result = await service.send(makeSendDto('UNKNOWN_CHANNEL'));
    expect(result.status).toBe('FAILED');
    const meta = result.metadata as any;
    expect(meta.failureReason).toBe('notification_channel_unknown');
  });

  it('re-throws and saves FAILED when channel.send throws', async () => {
    const webhook = { send: jest.fn().mockRejectedValue(new Error('network failure')) };
    const service = await makeService({ webhook });
    await expect(service.send(makeSendDto('WEBHOOK'))).rejects.toThrow('network failure');
    expect(mockNotificationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('includes failureReason in metadata when channel returns failure', async () => {
    const email = { send: jest.fn().mockResolvedValue({ success: false, failureReason: 'no_to' }) };
    const service = await makeService({ email });
    const result = await service.send(makeSendDto('EMAIL'));
    expect(result.status).toBe('FAILED');
    expect((result.metadata as any).failureReason).toBe('no_to');
  });

  // ── getUserNotifications ──────────────────────────────────────────────────
  describe('getUserNotifications', () => {
    it('returns notifications and total', async () => {
      const notifs = [{ id: 'n1' }];
      mockNotificationFindMany.mockResolvedValue(notifs);
      mockNotificationCount.mockResolvedValue(5);
      const service = await makeService();

      const result = await service.getUserNotifications('u1');
      expect(result.notifications).toBe(notifs);
      expect(result.total).toBe(5);
    });

    it('filters by status when provided', async () => {
      mockNotificationFindMany.mockResolvedValue([]);
      mockNotificationCount.mockResolvedValue(0);
      const service = await makeService();

      await service.getUserNotifications('u1', { status: 'SENT' as any });
      const where = mockNotificationFindMany.mock.calls[0][0].where;
      expect(where.status).toBe('SENT');
    });

    it('uses custom limit and offset', async () => {
      mockNotificationFindMany.mockResolvedValue([]);
      mockNotificationCount.mockResolvedValue(0);
      const service = await makeService();

      await service.getUserNotifications('u1', { limit: 5, offset: 10 });
      const call = mockNotificationFindMany.mock.calls[0][0];
      expect(call.take).toBe(5);
      expect(call.skip).toBe(10);
    });
  });

  // ── markAsRead ────────────────────────────────────────────────────────────
  describe('markAsRead', () => {
    it('updates readAt for found notification', async () => {
      mockNotificationFindFirst.mockResolvedValue({ id: 'n1', userId: 'u1' });
      mockNotificationUpdate.mockResolvedValue({});
      const service = await makeService();

      await service.markAsRead('n1', 'u1');
      expect(mockNotificationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n1' }, data: expect.objectContaining({ readAt: expect.any(Date) }) }),
      );
    });

    it('throws when notification not found', async () => {
      mockNotificationFindFirst.mockResolvedValue(null);
      const service = await makeService();
      await expect(service.markAsRead('bad-id', 'u1')).rejects.toThrow('Notification not found');
    });
  });

  // ── markAllAsRead ──────────────────────────────────────────────────────────
  it('marks all unread notifications as read', async () => {
    mockNotificationUpdateMany.mockResolvedValue({ count: 3 });
    const service = await makeService();
    await service.markAllAsRead('u1');
    expect(mockNotificationUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  // ── deleteNotification ─────────────────────────────────────────────────────
  describe('deleteNotification', () => {
    it('deletes found notification', async () => {
      mockNotificationFindFirst.mockResolvedValue({ id: 'n1' });
      mockNotificationDelete.mockResolvedValue({});
      const service = await makeService();

      await service.deleteNotification('n1', 'u1');
      expect(mockNotificationDelete).toHaveBeenCalledWith({ where: { id: 'n1' } });
    });

    it('throws when notification not found', async () => {
      mockNotificationFindFirst.mockResolvedValue(null);
      const service = await makeService();
      await expect(service.deleteNotification('bad', 'u1')).rejects.toThrow('Notification not found');
    });
  });

  // ── getUnreadCount ─────────────────────────────────────────────────────────
  describe('getUnreadCount', () => {
    it('returns 0 when user has no accessible repos', async () => {
      mockUserRepoFindMany.mockResolvedValue([]);
      const service = await makeService();
      const count = await service.getUnreadCount('u1');
      expect(count).toBe(0);
    });

    it('returns count from prisma', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockNotificationCount.mockResolvedValue(7);
      const service = await makeService();
      const count = await service.getUnreadCount('u1');
      expect(count).toBe(7);
    });

    it('applies repositoryIdsParam filter', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }, { repositoryId: 'r2' }]);
      mockNotificationCount.mockResolvedValue(3);
      const service = await makeService();
      await service.getUnreadCount('u1', 'r1');
      expect(mockNotificationCount).toHaveBeenCalled();
    });
  });
});
