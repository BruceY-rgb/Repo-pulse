jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  Role: { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
  Platform: { GITHUB: 'GITHUB', GITLAB: 'GITLAB' },
  prisma: {},
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { BadRequestException } from '@nestjs/common';
import { SettingsController } from '../../src/modules/settings/settings.controller';

const INTEGRATION_STATUS = { connected: true, githubLogin: 'ZichaoZhu', githubId: '167670554', tokenMasked: 'ghp_***' };

function makeSettingsService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    updateGithubToken: jest.fn().mockResolvedValue(INTEGRATION_STATUS),
    ...overrides,
  } as any;
}

function makeSyncService(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    syncUserRepositories: jest.fn().mockResolvedValue({ synced: 0, starred: 0 }),
    ...overrides,
  } as any;
}

describe('SettingsController · updateGithubToken（保存后内联同步）', () => {
  const user = { sub: 'u1' };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects blank token with BadRequestException without touching services', async () => {
    const settingsService = makeSettingsService();
    const syncService = makeSyncService();
    const controller = new SettingsController(settingsService, syncService);

    await expect(controller.updateGithubToken(user, { token: '   ' })).rejects.toThrow(BadRequestException);
    expect(settingsService.updateGithubToken).not.toHaveBeenCalled();
    expect(syncService.syncUserRepositories).not.toHaveBeenCalled();
  });

  it('awaits the sync and returns sync=completed with counts', async () => {
    const syncService = makeSyncService({
      syncUserRepositories: jest.fn().mockResolvedValue({ synced: 5, starred: 2 }),
    });
    const controller = new SettingsController(makeSettingsService(), syncService);

    const result = await controller.updateGithubToken(user, { token: 'ghp_x' });

    // throwOnFetchError 让 GitHub 拉取失败时 sync promise 真正 reject（而非吞错返回 0），failed 状态才可达
    expect(syncService.syncUserRepositories).toHaveBeenCalledWith('u1', { throwOnFetchError: true });
    expect(result).toMatchObject({
      ...INTEGRATION_STATUS,
      sync: { status: 'completed', synced: 5, starred: 2 },
    });
  });

  it('returns sync=failed when the sync rejects, while the token save itself succeeds', async () => {
    const syncService = makeSyncService({
      syncUserRepositories: jest.fn().mockRejectedValue(new Error('github down')),
    });
    const controller = new SettingsController(makeSettingsService(), syncService);

    const result = await controller.updateGithubToken(user, { token: 'ghp_x' });

    expect(result).toMatchObject({ ...INTEGRATION_STATUS, sync: { status: 'failed' } });
  });

  it('returns sync=pending when the sync outlives the 15s wait cap', async () => {
    jest.useFakeTimers();
    const syncService = makeSyncService({
      syncUserRepositories: jest.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const controller = new SettingsController(makeSettingsService(), syncService);

    const resultPromise = controller.updateGithubToken(user, { token: 'ghp_x' });
    await jest.advanceTimersByTimeAsync(15_000);
    const result = await resultPromise;

    expect(result).toMatchObject({ ...INTEGRATION_STATUS, sync: { status: 'pending' } });
  });
});
