jest.mock('@repo-pulse/database', () => ({
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  EventType: { PUSH: 'PUSH', PR_OPENED: 'PR_OPENED', PR_MERGED: 'PR_MERGED', PR_CLOSED: 'PR_CLOSED', PR_REVIEW: 'PR_REVIEW', ISSUE_OPENED: 'ISSUE_OPENED', ISSUE_CLOSED: 'ISSUE_CLOSED', ISSUE_COMMENT: 'ISSUE_COMMENT', RELEASE: 'RELEASE', BRANCH_CREATED: 'BRANCH_CREATED', BRANCH_DELETED: 'BRANCH_DELETED' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
  AnalysisStatus: { PENDING: 'PENDING', PROCESSING: 'PROCESSING', COMPLETED: 'COMPLETED', FAILED: 'FAILED', SKIPPED: 'SKIPPED' },
  FilterAction: { INCLUDE: 'INCLUDE', EXCLUDE: 'EXCLUDE', TAG: 'TAG' },
  ApprovalStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', EDITED: 'EDITED' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  NotificationStatus: { PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED', READ: 'READ' },
  ReportType: { WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY', CUSTOM: 'CUSTOM' },
  ReportFormat: { MARKDOWN: 'MARKDOWN', PDF: 'PDF', HTML: 'HTML' },
  ReportStatus: { GENERATING: 'GENERATING', COMPLETED: 'COMPLETED', FAILED: 'FAILED' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  prisma: {},
}));

/**
 * Thin delegation tests for all remaining controllers.
 * Each controller is instantiated directly with mocked services.
 */

// ── Shared mocks ─────────────────────────────────────────────────────────────

function makeMock<T extends object>(methods: string[]): T {
  const obj: any = {};
  methods.forEach((m) => { obj[m] = jest.fn().mockResolvedValue(undefined); });
  return obj as T;
}

const user = { sub: 'u1' };

// ── UserController ────────────────────────────────────────────────────────────

import { UserController } from '../../src/modules/user/user.controller';
import { UserService } from '../../src/modules/user/user.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: jest.Mocked<UserService>;

  beforeEach(() => {
    userService = makeMock(['findById', 'updatePreferences', 'updateProfile', 'fetchGithubAvatar']);
    userService.findById.mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any);
    userService.updatePreferences.mockResolvedValue({ id: 'u1' } as any);
    userService.updateProfile.mockResolvedValue({ id: 'u1' } as any);
    userService.fetchGithubAvatar.mockResolvedValue('https://avatar.url');
    controller = new UserController(userService as any);
  });

  it('getMe delegates to findById', async () => {
    const result = await controller.getMe(user);
    expect(userService.findById).toHaveBeenCalledWith('u1');
    expect(result).toHaveProperty('id', 'u1');
  });

  it('updatePreferences delegates to service', async () => {
    await controller.updatePreferences(user, { preferences: { theme: 'dark' } } as any);
    expect(userService.updatePreferences).toHaveBeenCalledWith('u1', { theme: 'dark' });
  });

  it('updateProfile delegates to service', async () => {
    await controller.updateProfile(user, { name: 'Bob' });
    expect(userService.updateProfile).toHaveBeenCalledWith('u1', { name: 'Bob' });
  });

  it('getGithubAvatar returns avatar object', async () => {
    const result = await controller.getGithubAvatar(user);
    expect(result).toEqual({ avatar: 'https://avatar.url' });
  });

  it('uploadAvatar converts file to base64 and updates profile', async () => {
    const file = { mimetype: 'image/png', buffer: Buffer.from('img-data') };
    const result = await controller.uploadAvatar(user, file as any);
    expect(userService.updateProfile).toHaveBeenCalledWith('u1', expect.objectContaining({ avatar: expect.stringContaining('data:image/png;base64,') }));
    expect(result.avatar).toContain('data:image/png;base64,');
  });
});

// ── NotificationController ────────────────────────────────────────────────────

import { NotificationController } from '../../src/modules/notification/notification.controller';
import { NotificationService } from '../../src/modules/notification/notification.service';

describe('NotificationController', () => {
  let controller: NotificationController;
  let service: any;

  beforeEach(() => {
    service = {
      getPreferences: jest.fn().mockResolvedValue({ channels: [] }),
      updatePreferences: jest.fn().mockResolvedValue({ channels: [] }),
      getUserNotifications: jest.fn().mockResolvedValue({ notifications: [], total: 0 }),
      getUnreadCount: jest.fn().mockResolvedValue(3),
      markAsRead: jest.fn().mockResolvedValue(undefined),
      markAllAsRead: jest.fn().mockResolvedValue(undefined),
      deleteNotification: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue({ id: 'n1' }),
    };
    controller = new NotificationController(service as any);
  });

  it('getPreferences delegates to service', async () => {
    const result = await controller.getPreferences(user);
    expect(service.getPreferences).toHaveBeenCalledWith('u1');
    expect(result).toHaveProperty('channels');
  });

  it('updatePreferences delegates to service', async () => {
    await controller.updatePreferences(user, {} as any);
    expect(service.updatePreferences).toHaveBeenCalledWith('u1', {});
  });

  it('getNotifications without query params uses defaults', async () => {
    const result = await controller.getNotifications(user);
    expect(service.getUserNotifications).toHaveBeenCalledWith('u1', { status: undefined, limit: undefined, offset: undefined });
    expect(result.total).toBe(0);
  });

  it('getNotifications parses limit and offset from string', async () => {
    await controller.getNotifications(user, undefined, '10', '20');
    expect(service.getUserNotifications).toHaveBeenCalledWith('u1', { status: undefined, limit: 10, offset: 20 });
  });

  it('getUnreadCount returns count object', async () => {
    const result = await controller.getUnreadCount(user, 'r1,r2');
    expect(service.getUnreadCount).toHaveBeenCalledWith('u1', 'r1,r2', undefined);
    expect(result).toEqual({ count: 3 });
  });

  it('markAsRead returns success', async () => {
    const result = await controller.markAsRead(user, 'n1');
    expect(service.markAsRead).toHaveBeenCalledWith('n1', 'u1');
    expect(result).toEqual({ success: true });
  });

  it('markAllAsRead returns success', async () => {
    const result = await controller.markAllAsRead(user);
    expect(service.markAllAsRead).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ success: true });
  });

  it('deleteNotification returns success', async () => {
    const result = await controller.deleteNotification(user, 'n1');
    expect(service.deleteNotification).toHaveBeenCalledWith('n1', 'u1');
    expect(result).toEqual({ success: true });
  });

  it('sendNotification delegates to service', async () => {
    const dto = { userId: 'u1', channel: 'EMAIL', title: 'T', content: 'C' } as any;
    const result = await controller.sendNotification(dto);
    expect(service.send).toHaveBeenCalledWith(dto);
    expect(result).toHaveProperty('id', 'n1');
  });
});

// ── ImController ──────────────────────────────────────────────────────────────

import { ImController } from '../../src/modules/im/im.controller';
import { ImService } from '../../src/modules/im/im.service';

describe('ImController', () => {
  let controller: ImController;
  let service: any;

  beforeEach(() => {
    service = {
      getStatus: jest.fn().mockResolvedValue({ feishu: {} }),
      saveFeishuConnection: jest.fn().mockResolvedValue({ state: 'configured' }),
      testFeishuConnection: jest.fn().mockResolvedValue({ success: true }),
      sendFeishuTestNotification: jest.fn().mockResolvedValue({ sent: 1 }),
      handleFeishuEvent: jest.fn().mockResolvedValue({ ok: true }),
      createPairingCode: jest.fn().mockResolvedValue({ code: 'ABCD1234' }),
      listSubscriptions: jest.fn().mockResolvedValue([]),
      saveSubscriptions: jest.fn().mockResolvedValue([]),
    };
    controller = new ImController(service as any);
  });

  it('getStatus delegates to service', async () => {
    const result = await controller.getStatus(user);
    expect(service.getStatus).toHaveBeenCalledWith('u1');
    expect(result).toHaveProperty('feishu');
  });

  it('saveFeishuConnection delegates to service', async () => {
    const body = { appId: 'aid', appSecret: 'sec' } as any;
    await controller.saveFeishuConnection(user, body);
    expect(service.saveFeishuConnection).toHaveBeenCalledWith('u1', body);
  });

  it('testFeishuConnection delegates to service', async () => {
    const body = { appId: 'aid', appSecret: 'sec' } as any;
    const result = await controller.testFeishuConnection(user, body);
    expect(service.testFeishuConnection).toHaveBeenCalledWith('u1', body);
    expect(result.success).toBe(true);
  });

  it('sendFeishuTestNotification delegates to service', async () => {
    const result = await controller.sendFeishuTestNotification(user);
    expect(service.sendFeishuTestNotification).toHaveBeenCalledWith('u1');
    expect(result.sent).toBe(1);
  });

  it('handleFeishuEvent delegates to service', async () => {
    const body = { header: { event_type: 'challenge' }, challenge: 'xyz' };
    service.handleFeishuEvent.mockResolvedValue({ challenge: 'xyz' });
    const result = await controller.handleFeishuEvent(body);
    expect(service.handleFeishuEvent).toHaveBeenCalledWith(body);
    expect(result).toHaveProperty('challenge');
  });

  it('createPairingCode delegates to service', async () => {
    const result = await controller.createPairingCode(user, {} as any);
    expect(service.createPairingCode).toHaveBeenCalledWith('u1', undefined);
    expect(result).toHaveProperty('code');
  });

  it('listSubscriptions delegates to service', async () => {
    const result = await controller.listSubscriptions(user);
    expect(service.listSubscriptions).toHaveBeenCalledWith('u1', 'feishu', undefined);
    expect(Array.isArray(result)).toBe(true);
  });

  it('saveSubscriptions delegates to service', async () => {
    const body = { subscriptions: [{ chatId: 'c1' }] } as any;
    await controller.saveSubscriptions(user, body);
    expect(service.saveSubscriptions).toHaveBeenCalledWith('u1', undefined, [{ chatId: 'c1' }], undefined);
  });
});

// ── ApprovalController ────────────────────────────────────────────────────────

import { NotFoundException } from '@nestjs/common';
import { ApprovalController } from '../../src/modules/approval/approval.controller';

describe('ApprovalController', () => {
  let controller: ApprovalController;
  let service: any;

  beforeEach(() => {
    service = {
      getApprovals: jest.fn().mockResolvedValue({ approvals: [], total: 0 }),
      getPendingCount: jest.fn().mockResolvedValue(2),
      getById: jest.fn().mockResolvedValue({ id: 'a1' }),
      approve: jest.fn().mockResolvedValue({ id: 'a1', status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ id: 'a1', status: 'REJECTED' }),
      delete: jest.fn().mockResolvedValue(undefined),
      editAndApprove: jest.fn().mockResolvedValue({ id: 'a1', status: 'APPROVED' }),
    };
    controller = new ApprovalController(service as any);
  });

  it('getApprovals delegates to service with parsed params', async () => {
    const result = await controller.getApprovals(user, undefined, '5', '10');
    expect(service.getApprovals).toHaveBeenCalledWith('u1', { status: undefined, limit: 5, offset: 10 });
    expect(result.total).toBe(0);
  });

  it('getPendingCount returns count object', async () => {
    const result = await controller.getPendingCount(user, 'r1');
    expect(service.getPendingCount).toHaveBeenCalledWith('u1', 'r1', undefined);
    expect(result).toEqual({ count: 2 });
  });

  it('getById delegates to service', async () => {
    const result = await controller.getById(user, 'a1');
    expect(service.getById).toHaveBeenCalledWith('u1', 'a1');
    expect(result).toHaveProperty('id', 'a1');
  });

  it('approve delegates to service', async () => {
    const result = await controller.approve(user, 'a1', { comment: 'LGTM' });
    expect(service.approve).toHaveBeenCalledWith('a1', 'u1', 'LGTM');
    expect(result).toHaveProperty('status', 'APPROVED');
  });

  it('reject delegates to service', async () => {
    await controller.reject(user, 'a1', { comment: 'nope' });
    expect(service.reject).toHaveBeenCalledWith('a1', 'u1', 'nope');
  });

  it('delete throws NotFoundException when approval not found', async () => {
    service.getById.mockResolvedValue(null);
    await expect(controller.delete(user, 'bad-id')).rejects.toThrow(NotFoundException);
  });

  it('delete succeeds when approval exists', async () => {
    const result = await controller.delete(user, 'a1');
    expect(service.delete).toHaveBeenCalledWith('u1', 'a1');
    expect(result).toEqual({ success: true });
  });

  it('editAndApprove delegates to service', async () => {
    const result = await controller.editAndApprove(user, 'a1', { editedContent: 'new content', comment: 'ok' });
    expect(service.editAndApprove).toHaveBeenCalledWith('a1', 'u1', 'new content', 'ok');
    expect(result).toHaveProperty('status', 'APPROVED');
  });
});

// ── FilterController ──────────────────────────────────────────────────────────

import { FilterController } from '../../src/modules/filter/filter.controller';

describe('FilterController', () => {
  let controller: FilterController;
  let service: any;

  beforeEach(() => {
    service = {
      getRules: jest.fn().mockResolvedValue([{ id: 'r1' }]),
      createRule: jest.fn().mockResolvedValue({ id: 'r1' }),
      updateRule: jest.fn().mockResolvedValue({ id: 'r1' }),
      deleteRule: jest.fn().mockResolvedValue(undefined),
      testRule: jest.fn().mockResolvedValue({ matched: true, action: 'block' }),
    };
    controller = new FilterController(service as any);
  });

  it('getRules delegates to service', async () => {
    const result = await controller.getRules(user);
    expect(service.getRules).toHaveBeenCalledWith('u1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('createRule delegates to service', async () => {
    const dto = { name: 'rule1' } as any;
    const result = await controller.createRule(user, dto);
    expect(service.createRule).toHaveBeenCalledWith('u1', dto);
    expect(result).toHaveProperty('id');
  });

  it('updateRule delegates to service', async () => {
    const dto = { name: 'updated' } as any;
    await controller.updateRule(user, 'r1', dto);
    expect(service.updateRule).toHaveBeenCalledWith('u1', 'r1', dto);
  });

  it('deleteRule delegates and returns success', async () => {
    const result = await controller.deleteRule(user, 'r1');
    expect(service.deleteRule).toHaveBeenCalledWith('u1', 'r1');
    expect(result).toEqual({ success: true });
  });

  it('testRule delegates to service', async () => {
    const dto = { eventType: 'PUSH', branch: 'main' } as any;
    const result = await controller.testRule(dto);
    expect(service.testRule).toHaveBeenCalledWith(dto);
    expect(result.matched).toBe(true);
  });
});

// ── SettingsController ────────────────────────────────────────────────────────

import { SettingsController } from '../../src/modules/settings/settings.controller';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: any;

  beforeEach(() => {
    service = {
      getAIConfig: jest.fn().mockResolvedValue({ provider: 'openai' }),
      updateAIConfig: jest.fn().mockResolvedValue({ provider: 'openai' }),
      resolveApiKey: jest.fn().mockResolvedValue('real-key'),
      testConnection: jest.fn().mockResolvedValue({ success: true }),
      fetchModels: jest.fn().mockResolvedValue({ models: ['gpt-4'] }),
    };
    controller = new SettingsController(service as any);
  });

  it('getAIConfig delegates to service', async () => {
    const result = await controller.getAIConfig(user);
    expect(service.getAIConfig).toHaveBeenCalledWith('u1');
    expect(result).toHaveProperty('provider');
  });

  it('updateAIConfig delegates to service', async () => {
    const body = { aiProvider: 'openai' as any };
    await controller.updateAIConfig(user, body);
    expect(service.updateAIConfig).toHaveBeenCalledWith('u1', body);
  });

  it('testConnection resolves key and tests connection', async () => {
    const body = { provider: 'openai' as any, apiKey: 'masked-key' };
    const result = await controller.testConnection(user, body);
    expect(service.resolveApiKey).toHaveBeenCalledWith('u1', 'masked-key');
    expect(service.testConnection).toHaveBeenCalledWith('openai', 'real-key', undefined);
    expect(result.success).toBe(true);
  });

  it('fetchModels resolves key and fetches models', async () => {
    const body = { provider: 'openai' as any, apiKey: 'masked', baseUrl: 'https://api.openai.com' };
    const result = await controller.fetchModels(user, body);
    expect(service.resolveApiKey).toHaveBeenCalledWith('u1', 'masked');
    expect(service.fetchModels).toHaveBeenCalledWith('openai', 'real-key', 'https://api.openai.com');
    expect(result).toHaveProperty('models');
  });
});

// ── EventController ───────────────────────────────────────────────────────────

import { EventController } from '../../src/modules/event/event.controller';

describe('EventController', () => {
  let controller: EventController;
  let service: any;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue({ events: [], total: 0 }),
      getEventStats: jest.fn().mockResolvedValue({ total: 5 }),
      findById: jest.fn().mockResolvedValue({ id: 'e1' }),
    };
    controller = new EventController(service as any);
  });

  it('findAll delegates to service', async () => {
    const query = { repositoryId: 'r1' } as any;
    const result = await controller.findAll(user, query);
    expect(service.findAll).toHaveBeenCalledWith('u1', query);
    expect(result).toHaveProperty('events');
  });

  it('getStats delegates with date params parsed', async () => {
    const query = { repositoryId: 'r1', repositoryIds: undefined, branchScopes: undefined, dateFrom: '2024-01-01', dateTo: '2024-12-31' } as any;
    const result = await controller.getStats(user, query);
    expect(service.getEventStats).toHaveBeenCalledWith(
      'u1', 'r1', undefined, undefined,
      expect.any(Date),
      expect.any(Date),
    );
    expect(result.total).toBe(5);
  });

  it('getStats with no dates passes undefined', async () => {
    const query = {} as any;
    await controller.getStats(user, query);
    expect(service.getEventStats).toHaveBeenCalledWith('u1', undefined, undefined, undefined, undefined, undefined);
  });

  it('findById delegates to service', async () => {
    const result = await controller.findById('e1');
    expect(service.findById).toHaveBeenCalledWith('e1');
    expect(result).toHaveProperty('id', 'e1');
  });
});

// ── DashboardController ───────────────────────────────────────────────────────

import { DashboardController } from '../../src/modules/dashboard/dashboard.controller';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: any;

  beforeEach(() => {
    service = {
      getOverview: jest.fn().mockResolvedValue({ repos: 3 }),
      getActivity: jest.fn().mockResolvedValue({ days: [] }),
      getRecentActivity: jest.fn().mockResolvedValue([]),
    };
    controller = new DashboardController(service as any);
  });

  it('getOverview delegates to service', async () => {
    const result = await controller.getOverview(user, 'r1,r2');
    expect(service.getOverview).toHaveBeenCalledWith('u1', 'r1,r2', undefined);
    expect(result).toHaveProperty('repos');
  });

  it('getActivity delegates to service', async () => {
    await controller.getActivity(user, 7, 'r1');
    expect(service.getActivity).toHaveBeenCalledWith('u1', 7, 'r1', undefined);
  });

  it('getRecentActivity delegates to service', async () => {
    const result = await controller.getRecentActivity(user, 5, 'r1');
    expect(service.getRecentActivity).toHaveBeenCalledWith('u1', 5, 'r1', undefined);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── WebhookController ─────────────────────────────────────────────────────────

import { WebhookController } from '../../src/modules/webhook/webhook.controller';

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: any;

  beforeEach(() => {
    service = {
      handleGithubWebhook: jest.fn().mockResolvedValue(undefined),
      handleGitlabWebhook: jest.fn().mockResolvedValue(undefined),
    };
    controller = new WebhookController(service as any);
  });

  it('handleGithubWebhook delegates to service and returns success', async () => {
    const rawBody = Buffer.from('{}');
    const req = { rawBody } as any;
    const payload = { repository: { id: 1 } };
    const result = await controller.handleGithubWebhook(
      'sha256=abc',
      'push',
      'delivery-1',
      req,
      payload,
    );
    expect(service.handleGithubWebhook).toHaveBeenCalledWith('sha256=abc', 'push', rawBody, payload);
    expect(result).toEqual({ success: true });
  });

  it('handleGitlabWebhook delegates to service and returns success', async () => {
    const payload = { object_kind: 'push' };
    const result = await controller.handleGitlabWebhook('secret-token', payload);
    expect(service.handleGitlabWebhook).toHaveBeenCalledWith('secret-token', payload);
    expect(result).toEqual({ success: true });
  });
});
