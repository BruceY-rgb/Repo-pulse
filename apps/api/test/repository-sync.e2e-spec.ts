import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { PrismaClient, Platform } from '@repo-pulse/database';
import { AppModule } from '../src/app.module';
import { GithubService } from '../src/modules/repository/services/github.service';
import { AIService } from '../src/modules/ai/ai.service';
import { FilterService } from '../src/modules/filter/filter.service';
import { NotificationService } from '../src/modules/notification/notification.service';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-repo-sync@repopulse.dev',
  password: 'repo-sync-test-123',
  name: 'Repo Sync Test User',
};

describe('Repository sync (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
  let testUserId: string;
  let testRepoId: string;

  const githubServiceMock = {
    getRepository: jest.fn(),
    createWebhook: jest.fn(),
    getBranches: jest.fn(),
    getCommits: jest.fn(),
    getPullRequests: jest.fn(),
    getIssues: jest.fn(),
    getBranches: jest.fn().mockResolvedValue(['main']),
    searchRepositories: jest.fn(),
    getUserRepositories: jest.fn(),
    getStarredRepos: jest.fn(),
  };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        passwordHash: await bcrypt.hash(TEST_USER.password, 10),
        githubAccessToken: 'test-github-token',
      },
    });
    testUserId = user.id;

    const repo = await prisma.repository.create({
      data: {
        name: 'sync-test-repo',
        fullName: 'sync-org/sync-test-repo',
        platform: Platform.GITHUB,
        externalId: 'sync-777000333',
        url: 'https://github.com/sync-org/sync-test-repo',
      },
    });
    testRepoId = repo.id;

    await prisma.userRepository.create({
      data: { userId: testUserId, repositoryId: testRepoId, role: 'ADMIN' },
    });

    githubServiceMock.getCommits.mockResolvedValue([
      {
        sha: 'commit-sha-1',
        html_url: 'https://github.com/sync-org/sync-test-repo/commit/1',
        commit: {
          message: 'Sync commit',
          author: { name: 'Sync Bot', date: '2026-04-20T08:30:00.000Z' },
        },
        author: { login: 'sync-bot', avatar_url: 'https://avatar/1.png' },
      },
    ]);
    githubServiceMock.getBranches.mockResolvedValue(['main']);
    githubServiceMock.getPullRequests.mockResolvedValue([
      {
        id: 101,
        title: 'Sync PR',
        body: 'PR body',
        html_url: 'https://github.com/sync-org/sync-test-repo/pull/101',
        state: 'open',
        created_at: '2026-04-21T09:00:00.000Z',
        updated_at: new Date().toISOString(),
        user: { login: 'octocat', avatar_url: 'https://avatar/2.png' },
        number: 101,
      },
    ]);
    githubServiceMock.getIssues.mockResolvedValue([
      {
        id: 202,
        title: 'Sync issue',
        body: 'Issue body',
        html_url: 'https://github.com/sync-org/sync-test-repo/issues/202',
        state: 'open',
        created_at: '2026-04-22T10:00:00.000Z',
        updated_at: new Date().toISOString(),
        user: { login: 'issue-bot', avatar_url: 'https://avatar/3.png' },
        number: 202,
      },
    ]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GithubService)
      .useValue(githubServiceMock)
      .overrideProvider(AIService)
      .useValue({ triggerAnalysis: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(FilterService)
      .useValue({
        applyRules: jest.fn().mockResolvedValue({ action: 'INCLUDE' }),
      })
      .overrideProvider(NotificationService)
      .useValue({
        getPreferences: jest.fn().mockResolvedValue({
          channels: ['IN_APP'],
          events: {
            highRisk: true,
            prUpdates: true,
            analysisComplete: true,
            weeklyReport: false,
          },
        }),
        send: jest.fn().mockResolvedValue({ status: 'SENT' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    authCookie = (loginRes.headers['set-cookie'] as unknown as string[]).join('; ');
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.userRepository.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.repository.deleteMany({ where: { id: testRepoId } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('POST /repositories/:id/sync should create history events and return a sync summary', async () => {
    const res = await request(app.getHttpServer())
      .post(`/repositories/${testRepoId}/sync`)
      .set('Cookie', authCookie)
      .expect(201);

    expect(res.body.data.repositoryId).toBe(testRepoId);
    expect(res.body.data.createdCount).toBe(3);
    expect(res.body.data.skippedCount).toBe(0);
    expect(res.body.data.failedSources).toEqual([]);
    expect(typeof res.body.data.lastSyncAt).toBe('string');

    const events = await prisma.event.findMany({
      where: { repositoryId: testRepoId },
      select: { externalId: true, occurredAt: true, createdAt: true },
    });

    expect(events).toHaveLength(3);
    expect(events.every((event) => event.occurredAt instanceof Date)).toBe(true);
    expect(
      events.some((event) => event.externalId === 'commit-sha-1' && event.occurredAt?.toISOString() === '2026-04-20T08:30:00.000Z'),
    ).toBe(true);
  });

  it('POST /repositories/:id/sync should skip already imported history on the second run', async () => {
    const res = await request(app.getHttpServer())
      .post(`/repositories/${testRepoId}/sync`)
      .set('Cookie', authCookie)
      .expect(201);

    expect(res.body.data.createdCount).toBe(0);
    expect(res.body.data.skippedCount).toBeGreaterThanOrEqual(3);
  });
});
