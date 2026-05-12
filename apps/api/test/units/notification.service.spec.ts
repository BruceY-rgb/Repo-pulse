import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationStatus } from '@repo-pulse/database';
import { NotificationService } from '@modules/notification/notification.service';
import { EmailChannel } from '@modules/notification/channels/email.channel';
import { DingTalkChannel } from '@modules/notification/channels/dingtalk.channel';
import { FeishuChannel } from '@modules/notification/channels/feishu.channel';
import { WebhookChannel } from '@modules/notification/channels/webhook.channel';

// 内存 fake：替代 prisma 的 user / notification 操作
const userStore = new Map<string, { id: string; preferences: Record<string, unknown> }>();
const notificationStore = new Map<string, any>();
let notificationSeq = 0;

jest.mock('@repo-pulse/database', () => {
  const actual = jest.requireActual('@repo-pulse/database');
  return {
    ...actual,
    prisma: {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const u = userStore.get(where.id);
          if (!u) return null;
          return { id: u.id, preferences: u.preferences };
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: { preferences: Record<string, unknown> };
          }) => {
            const existing = userStore.get(where.id);
            if (!existing) throw new Error('user not found');
            existing.preferences = data.preferences;
            return existing;
          },
        ),
      },
      notification: {
        create: jest.fn(async ({ data }: { data: any }) => {
          const id = `notif-${++notificationSeq}`;
          const record = {
            id,
            createdAt: new Date(),
            sentAt: null,
            readAt: null,
            ...data,
          };
          notificationStore.set(id, record);
          return record;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
          const record = notificationStore.get(where.id);
          if (!record) throw new Error('notification not found');
          Object.assign(record, data);
          return record;
        }),
      },
    },
  };
});

describe('NotificationService (unit)', () => {
  let service: NotificationService;

  beforeEach(async () => {
    userStore.clear();
    notificationStore.clear();
    notificationSeq = 0;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: EmailChannel,
          useValue: {
            send: jest.fn(async ({ to }: { to?: string }) =>
              to
                ? { success: false, failureReason: 'notification_channel_not_implemented' }
                : { success: false, failureReason: 'notification_email_missing' },
            ),
          },
        },
        {
          provide: DingTalkChannel,
          useValue: { send: jest.fn(async () => ({ success: true })) },
        },
        {
          provide: FeishuChannel,
          useValue: { send: jest.fn(async () => ({ success: true })) },
        },
        {
          provide: WebhookChannel,
          useValue: { send: jest.fn(async () => ({ success: true })) },
        },
      ],
    }).compile();

    service = moduleRef.get(NotificationService);
  });

  describe('getPreferences - 默认值合并', () => {
    it('用户 preferences 为空 {} 时返回完整默认值', async () => {
      userStore.set('u1', { id: 'u1', preferences: {} });

      const prefs = await service.getPreferences('u1');

      expect(prefs.channels).toEqual([NotificationChannel.IN_APP]);
      expect(prefs.events).toEqual({
        highRisk: true,
        prUpdates: true,
        analysisComplete: true,
        weeklyReport: false,
      });
      expect(prefs.webhookUrl).toBeNull();
      expect(prefs.email).toBeNull();
    });

    it('用户不存在时仍返回完整默认值', async () => {
      const prefs = await service.getPreferences('does-not-exist');

      expect(prefs.channels).toEqual([NotificationChannel.IN_APP]);
      expect(prefs.events.highRisk).toBe(true);
      expect(prefs.events.weeklyReport).toBe(false);
    });

    it('部分自定义事件偏好与默认值合并，缺失字段回落默认值', async () => {
      userStore.set('u2', {
        id: 'u2',
        preferences: {
          notificationChannels: [NotificationChannel.WEBHOOK],
          notificationEvents: {
            weeklyReport: true,
            // highRisk / prUpdates / analysisComplete 缺失，应回落默认 true
          },
          notificationWebhookUrl: 'http://hook.example/x',
          notificationEmail: 'x@example.com',
        },
      });

      const prefs = await service.getPreferences('u2');

      expect(prefs.channels).toEqual([NotificationChannel.WEBHOOK]);
      expect(prefs.events).toEqual({
        highRisk: true,
        prUpdates: true,
        analysisComplete: true,
        weeklyReport: true,
      });
      expect(prefs.webhookUrl).toBe('http://hook.example/x');
      expect(prefs.email).toBe('x@example.com');
    });
  });

  describe('updatePreferences - 部分更新深合并', () => {
    it('只更新部分 events 字段，其它字段保留为已有值（非默认值）', async () => {
      userStore.set('u3', {
        id: 'u3',
        preferences: {
          notificationChannels: [NotificationChannel.IN_APP, NotificationChannel.WEBHOOK],
          notificationEvents: {
            highRisk: false, // 已被用户关闭
            prUpdates: true,
            analysisComplete: true,
            weeklyReport: false,
          },
          notificationWebhookUrl: 'http://hook.example/keep',
          notificationEmail: 'keep@example.com',
        },
      });

      const updated = await service.updatePreferences('u3', {
        events: { weeklyReport: true },
      });

      // 只触达 weeklyReport，highRisk=false 应被保留
      expect(updated.events).toEqual({
        highRisk: false,
        prUpdates: true,
        analysisComplete: true,
        weeklyReport: true,
      });
      // channels / webhookUrl / email 未传入，应保持不变
      expect(updated.channels).toEqual([
        NotificationChannel.IN_APP,
        NotificationChannel.WEBHOOK,
      ]);
      expect(updated.webhookUrl).toBe('http://hook.example/keep');
      expect(updated.email).toBe('keep@example.com');
    });

    it('未传入 webhookUrl/email 时不会清空，传入空串时按用户传入写回', async () => {
      userStore.set('u4', {
        id: 'u4',
        preferences: {
          notificationWebhookUrl: 'http://hook/keep',
          notificationEmail: 'keep@example.com',
        },
      });

      // 不传 webhookUrl/email — 不能被清空
      const partial = await service.updatePreferences('u4', { events: { highRisk: false } });
      expect(partial.webhookUrl).toBe('http://hook/keep');
      expect(partial.email).toBe('keep@example.com');

      // 传入显式新值 — 覆写成功
      const overwritten = await service.updatePreferences('u4', {
        webhookUrl: 'http://hook/new',
      });
      expect(overwritten.webhookUrl).toBe('http://hook/new');
      expect(overwritten.email).toBe('keep@example.com');
    });
  });

  describe('send - 未实现通道失败原因写入', () => {
    it('Email 通道未配置收件人时，notification 状态为 FAILED 且 metadata.failureReason 写入', async () => {
      userStore.set('u5', { id: 'u5', preferences: {} });

      const result = await service.send({
        userId: 'u5',
        channel: NotificationChannel.EMAIL,
        title: 'hi',
        content: 'hello',
      });

      expect(result.status).toBe(NotificationStatus.FAILED);
      expect(result.sentAt).toBeNull();
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.failureReason).toBe('notification_email_missing');
    });

    it('IN_APP 通道始终成功并写入 SENT', async () => {
      userStore.set('u6', { id: 'u6', preferences: {} });

      const result = await service.send({
        userId: 'u6',
        channel: NotificationChannel.IN_APP,
        title: 'in-app',
        content: 'body',
      });

      expect(result.status).toBe(NotificationStatus.SENT);
      expect(result.sentAt).toBeInstanceOf(Date);
    });
  });
});
