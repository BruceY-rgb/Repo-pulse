jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  prisma: {},
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SettingsController } from '../../src/modules/settings/settings.controller';

const INTEGRATION_STATUS = { connected: true, githubLogin: 'ZichaoZhu', githubId: '167670554', tokenMasked: 'ghp_***' };

function makeSettingsService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    updateGithubToken: jest.fn().mockResolvedValue(INTEGRATION_STATUS),
    canUpdateApiUrlConfig: jest.fn().mockResolvedValue(false),
    updateApiUrlConfig: jest.fn().mockResolvedValue({ value: 'https://example.test', source: 'db' }),
    ...overrides,
  } as any;
}

function makeSyncService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    syncUserRepositories: jest.fn().mockResolvedValue({ synced: 0, starred: 0 }),
    ...overrides,
  } as any;
}

describe('SettingsController · updateGithubToken（保存后后台同步）', () => {
  const user = { sub: 'u1' };

  it('rejects blank token with BadRequestException without touching services', async () => {
    const settingsService = makeSettingsService();
    const syncService = makeSyncService();
    const controller = new SettingsController(settingsService, syncService);

    await expect(controller.updateGithubToken(user, { token: '   ' })).rejects.toThrow(BadRequestException);
    expect(settingsService.updateGithubToken).not.toHaveBeenCalled();
    expect(syncService.syncUserRepositories).not.toHaveBeenCalled();
  });

  it('saves the token, starts background sync, and returns sync=pending immediately', async () => {
    const syncService = makeSyncService({
      syncUserRepositories: jest.fn().mockResolvedValue({ synced: 5, starred: 2 }),
    });
    const controller = new SettingsController(makeSettingsService(), syncService);

    const result = await controller.updateGithubToken(user, { token: 'ghp_x' });

    // throwOnFetchError 让 GitHub 拉取失败时 sync promise 真正 reject（而非吞错返回 0），failed 状态才可达
    expect(syncService.syncUserRepositories).toHaveBeenCalledWith('u1', { throwOnFetchError: true });
    expect(result).toMatchObject({
      ...INTEGRATION_STATUS,
      sync: { status: 'pending' },
    });
  });

  it('still returns sync=pending when the background sync rejects', async () => {
    const syncService = makeSyncService({
      syncUserRepositories: jest.fn().mockRejectedValue(new Error('github down')),
    });
    const controller = new SettingsController(makeSettingsService(), syncService);

    const result = await controller.updateGithubToken(user, { token: 'ghp_x' });

    expect(result).toMatchObject({ ...INTEGRATION_STATUS, sync: { status: 'pending' } });
  });
});

describe('SettingsController · updateApiUrlConfig', () => {
  it('allows users with editable repositories to update webhook API_URL', async () => {
    const settingsService = makeSettingsService({
      canUpdateApiUrlConfig: jest.fn().mockResolvedValue(true),
    });
    const controller = new SettingsController(settingsService, makeSyncService());

    await controller.updateApiUrlConfig(
      { sub: 'u1' },
      { value: 'https://fresh.trycloudflare.com ' },
    );

    expect(settingsService.canUpdateApiUrlConfig).toHaveBeenCalledWith('u1');
    expect(settingsService.updateApiUrlConfig).toHaveBeenCalledWith(
      'u1',
      'https://fresh.trycloudflare.com',
    );
  });

  it('rejects users without editable repositories regardless of global role', async () => {
    const settingsService = makeSettingsService({
      canUpdateApiUrlConfig: jest.fn().mockResolvedValue(false),
    });
    const controller = new SettingsController(settingsService, makeSyncService());
    const adminUser = { sub: 'u1', role: 'ADMIN' };

    await expect(
      controller.updateApiUrlConfig(
        adminUser,
        { value: 'https://fresh.trycloudflare.com' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(settingsService.canUpdateApiUrlConfig).toHaveBeenCalledWith('u1');
    expect(settingsService.updateApiUrlConfig).not.toHaveBeenCalled();
  });
});
