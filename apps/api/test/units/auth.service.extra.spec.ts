jest.mock('@repo-pulse/database', () => ({
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  NotificationChannel: { EMAIL: 'EMAIL', DINGTALK: 'DINGTALK', FEISHU: 'FEISHU', WEBHOOK: 'WEBHOOK', IN_APP: 'IN_APP' },
  prisma: {},
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

import { UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/modules/auth/auth.service';

jest.mock('bcrypt');
jest.mock('axios');

const mockAxios = axios as jest.Mocked<typeof axios>;

function makeUser(overrides: object = {}) {
  return {
    id: 'u1', email: 'alice@example.com', name: 'Alice', avatar: null,
    passwordHash: 'hashed', githubId: null, githubAccessToken: null,
    githubRefreshToken: null, role: 'MEMBER', preferences: {},
    aiProvider: null, aiApiKey: null, aiBaseUrl: null, aiModel: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

function makeService(opts: {
  configGet?: jest.Mock;
  findByGithubId?: jest.Mock;
  findByEmail?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  signAsync?: jest.Mock;
  syncUserRepos?: jest.Mock;
} = {}) {
  const configGet = opts.configGet ?? jest.fn().mockImplementation((key: string) =>
    key === 'DESKTOP_AUTH_MODE' ? 'env' : key === 'GITHUB_TOKEN' ? 'gh-token' : undefined,
  );
  const jwtService = { signAsync: opts.signAsync ?? jest.fn().mockResolvedValue('token'), verifyAsync: jest.fn() } as any;
  const configService = { get: configGet } as any;
  const userService = {
    findByEmail: opts.findByEmail ?? jest.fn().mockResolvedValue(null),
    findByGithubId: opts.findByGithubId ?? jest.fn().mockResolvedValue(null),
    create: opts.create ?? jest.fn().mockResolvedValue(makeUser()),
    update: opts.update ?? jest.fn().mockResolvedValue(makeUser()),
  } as any;
  const syncService = { syncUserRepositories: opts.syncUserRepos ?? jest.fn().mockResolvedValue(undefined) } as any;

  return new AuthService(jwtService, configService, userService, syncService);
}

const makeGithubProfile = () => ({
  id: 123, login: 'alice', name: 'Alice GitHub', email: 'alice@example.com', avatar_url: 'https://avatar.url',
});

describe('AuthService - handleGithubEnvTokenAuth coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates new user when no existing user found', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const service = makeService({ create, findByGithubId: jest.fn().mockResolvedValue(null), findByEmail: jest.fn().mockResolvedValue(null) });
    mockAxios.get.mockResolvedValueOnce({ data: makeGithubProfile() });

    await service.handleGithubEnvTokenAuth();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: 'alice@example.com' }));
  });

  it('links existing email user when githubId not yet set', async () => {
    const existingUser = makeUser();
    const update = jest.fn().mockResolvedValue(existingUser);
    const service = makeService({
      findByGithubId: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(existingUser),
      update,
    });
    mockAxios.get.mockResolvedValueOnce({ data: makeGithubProfile() });

    await service.handleGithubEnvTokenAuth();
    expect(update).toHaveBeenCalledWith(existingUser.id, expect.objectContaining({ githubId: '123' }));
  });

  it('updates existing github user tokens', async () => {
    const existingUser = makeUser({ githubId: '123' });
    const update = jest.fn().mockResolvedValue(existingUser);
    const service = makeService({ findByGithubId: jest.fn().mockResolvedValue(existingUser), update });
    mockAxios.get.mockResolvedValueOnce({ data: makeGithubProfile() });

    await service.handleGithubEnvTokenAuth();
    expect(update).toHaveBeenCalledWith(existingUser.id, expect.objectContaining({ githubAccessToken: 'gh-token' }));
  });

  it('fetches email when profile email is null', async () => {
    const create = jest.fn().mockResolvedValue(makeUser({ email: 'alice@work.com' }));
    const service = makeService({ create, findByGithubId: jest.fn().mockResolvedValue(null), findByEmail: jest.fn().mockResolvedValue(null) });
    const profileNoEmail = { ...makeGithubProfile(), email: null };
    mockAxios.get
      .mockResolvedValueOnce({ data: profileNoEmail })
      .mockResolvedValueOnce({ data: [{ email: 'alice@work.com', primary: true, verified: true, visibility: null }] });

    await service.handleGithubEnvTokenAuth();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: 'alice@work.com' }));
  });

  it('uses login@noreply fallback when both profile.email and emails API fail', async () => {
    const create = jest.fn().mockResolvedValue(makeUser());
    const service = makeService({ create, findByGithubId: jest.fn().mockResolvedValue(null), findByEmail: jest.fn().mockResolvedValue(null) });
    const profileNoEmail = { ...makeGithubProfile(), email: null };
    mockAxios.get
      .mockResolvedValueOnce({ data: profileNoEmail })
      .mockRejectedValueOnce(new Error('emails API down'));

    await service.handleGithubEnvTokenAuth();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: 'alice@users.noreply.github.com' }));
  });

  it('throws when fetchGithubEnvProfile fails', async () => {
    const service = makeService();
    mockAxios.get.mockRejectedValueOnce(new Error('network error'));
    await expect(service.handleGithubEnvTokenAuth()).rejects.toThrow(UnauthorizedException);
  });

  it('uses verified non-primary email when no primary email found', async () => {
    const create = jest.fn().mockResolvedValue(makeUser({ email: 'verified@example.com' }));
    const service = makeService({ create, findByGithubId: jest.fn().mockResolvedValue(null), findByEmail: jest.fn().mockResolvedValue(null) });
    const profileNoEmail = { ...makeGithubProfile(), email: null };
    mockAxios.get
      .mockResolvedValueOnce({ data: profileNoEmail })
      .mockResolvedValueOnce({ data: [{ email: 'verified@example.com', primary: false, verified: true, visibility: null }] });

    await service.handleGithubEnvTokenAuth();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: 'verified@example.com' }));
  });

  it('returns token pair on success', async () => {
    const service = makeService({ findByGithubId: jest.fn().mockResolvedValue(makeUser()), update: jest.fn().mockResolvedValue(makeUser()), signAsync: jest.fn().mockResolvedValue('new-token') });
    mockAxios.get.mockResolvedValueOnce({ data: makeGithubProfile() });

    const result = await service.handleGithubEnvTokenAuth();
    expect(result).toHaveProperty('accessToken', 'new-token');
    expect(result).toHaveProperty('refreshToken', 'new-token');
  });
});
