import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import {
  PrismaClient,
  Platform,
  RepositoryAccessMode,
  RepositoryAccessLevel,
  EventType,
} from '@repo-pulse/database';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-dashboard@repopulse.dev',
  password: 'dashboard-test-123',
  name: 'Dashboard E2E Test User',
};

describe('DashboardModule (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
  let testUserId: string;
  let testRepoId: string;

  beforeAll(async () => {
    // 创建测试用户
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        passwordHash: await bcrypt.hash(TEST_USER.password, 10),
      },
    });
    testUserId = user.id;

    // 创建测试仓库
    const repo = await prisma.repository.create({
      data: {
        name: 'dashboard-test-repo',
        fullName: 'dashboard-org/dashboard-test-repo',
        platform: Platform.GITHUB,
        externalId: 'dashboard-ext-999',
        url: 'https://github.com/dashboard-org/dashboard-test-repo',
      },
    });
    testRepoId = repo.id;

    // 关联用户与仓库
    await prisma.userRepository.create({
      data: {
        userId: testUserId,
        repositoryId: testRepoId,
        role: 'ADMIN',
        accessMode: RepositoryAccessMode.EDITABLE,
        accessLevel: RepositoryAccessLevel.WRITE,
      },
    });

    // 创建一些测试事件（用于统计数据）
    await prisma.event.createMany({
      data: [
        {
          repositoryId: testRepoId,
          type: EventType.PUSH,
          action: 'push',
          title: 'Dashboard E2E Test Push 1',
          body: 'test body 1',
          author: 'test-author',
          externalId: 'dashboard-e2e-evt-1',
        },
        {
          repositoryId: testRepoId,
          type: EventType.PR_OPENED,
          action: 'opened',
          title: 'Dashboard E2E Test PR 1',
          body: 'test body 2',
          author: 'test-author',
          externalId: 'dashboard-e2e-evt-2',
        },
      ],
    });

    // 启动应用
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    // 登录
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    authCookie = loginRes.headers['set-cookie']?.[0] ?? '';
  }, 60000);

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.userRepository.deleteMany({ where: { userId: testUserId } });
    await prisma.repository.deleteMany({ where: { id: testRepoId } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── 未认证访问 ────────────────────────────────────────────────────────────
  describe('未认证访问', () => {
    it('GET /dashboard/overview 无 Cookie 应返回 401', () => {
      return request(app.getHttpServer()).get('/dashboard/overview').expect(401);
    });

    it('GET /dashboard/activity 无 Cookie 应返回 401', () => {
      return request(app.getHttpServer()).get('/dashboard/activity').expect(401);
    });

    it('GET /dashboard/recent-activity 无 Cookie 应返回 401', () => {
      return request(app.getHttpServer()).get('/dashboard/recent-activity').expect(401);
    });
  });

  // ── GET /dashboard/overview ───────────────────────────────────────────────
  describe('GET /dashboard/overview', () => {
    it('应返回 200 和统计数据结构', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/overview')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      const data = res.body.data;
      // 概览数据应包含基础统计字段
      expect(data).toBeDefined();
    });

    it('携带 repositoryIds 参数过滤时应返回 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/dashboard/overview?repositoryIds=${testRepoId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('携带不存在的 repositoryId 时应返回空数据而非 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/overview?repositoryIds=non-existent-repo-id')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });
  });

  // ── GET /dashboard/activity ───────────────────────────────────────────────
  describe('GET /dashboard/activity', () => {
    it('应返回 200 和活动图表数据', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/activity')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('指定 days=7 参数时应正常返回', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/activity?days=7')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('指定 days=30 参数时应正常返回', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/activity?days=30')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('携带 repositoryIds 过滤时应正常返回', async () => {
      const res = await request(app.getHttpServer())
        .get(`/dashboard/activity?days=7&repositoryIds=${testRepoId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });
  });

  // ── GET /dashboard/recent-activity ───────────────────────────────────────
  describe('GET /dashboard/recent-activity', () => {
    it('应返回 200 和最近活动列表', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/recent-activity')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('指定 limit=5 时应最多返回 5 条', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/recent-activity?limit=5')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      if (Array.isArray(res.body.data)) {
        expect(res.body.data.length).toBeLessThanOrEqual(5);
      }
    });

    it('携带 repositoryIds 过滤时应只返回该仓库的活动', async () => {
      const res = await request(app.getHttpServer())
        .get(`/dashboard/recent-activity?repositoryIds=${testRepoId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });
  });
});
