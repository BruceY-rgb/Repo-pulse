import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { PrismaClient, Platform } from '@repo-pulse/database';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-repo-contract@repopulse.dev',
  password: 'repo-test-123',
  name: 'Repo Contract Test User',
};

describe('RepositoryModule (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
  let testUserId: string;
  let testRepoId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        passwordHash: await bcrypt.hash(TEST_USER.password, 10),
      },
    });
    testUserId = user.id;

    const repo = await prisma.repository.create({
      data: {
        name: 'contract-test-repo',
        fullName: 'contract-org/contract-test-repo',
        platform: Platform.GITHUB,
        externalId: '777000333',
        url: 'https://github.com/contract-org/contract-test-repo',
      },
    });
    testRepoId = repo.id;

    await prisma.userRepository.create({
      data: { userId: testUserId, repositoryId: testRepoId, role: 'ADMIN' },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    authCookie = (loginRes.headers['set-cookie'] as unknown as string[]).join('; ');
  });

  afterAll(async () => {
    await prisma.userRepository.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.repository.deleteMany({ where: { externalId: '777000333' } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('未登录访问', () => {
    it('GET /repositories 应返回 401', () => {
      return request(app.getHttpServer()).get('/repositories').expect(401);
    });

    it('POST /repositories 应返回 401', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .send({ fullName: 'owner/repo', platform: 'GITHUB' })
        .expect(401);
    });

    it('GET /repositories/search 应返回 401', () => {
      return request(app.getHttpServer())
        .get('/repositories/search')
        .query({ q: 'nestjs' })
        .expect(401);
    });
  });

  describe('GET /repositories - 仓库列表契约', () => {
    it('应返回 200 且结果为数组', async () => {
      const res = await request(app.getHttpServer())
        .get('/repositories')
        .set('Cookie', authCookie)
        .expect(200);

      const list = res.body.data ?? res.body;
      expect(Array.isArray(list)).toBe(true);
    });

    it('只返回当前用户的仓库，不返回其他用户的', async () => {
      const res = await request(app.getHttpServer())
        .get('/repositories')
        .set('Cookie', authCookie)
        .expect(200);

      const list = res.body.data ?? res.body;
      const ids = list.map((r: { id: string }) => r.id);
      expect(ids).toContain(testRepoId);
    });

    it('返回的仓库对象包含必要字段', async () => {
      const res = await request(app.getHttpServer())
        .get('/repositories')
        .set('Cookie', authCookie)
        .expect(200);

      const list = res.body.data ?? res.body;
      const repo = list.find((r: { id: string }) => r.id === testRepoId);
      expect(repo).toBeDefined();

      expect(repo).toHaveProperty('id');
      expect(repo).toHaveProperty('name');
      expect(repo).toHaveProperty('fullName');
      expect(repo).toHaveProperty('platform');
      expect(repo).toHaveProperty('url');
      expect(repo).toHaveProperty('isActive');

      expect(repo.webhookSecret).toBeNull();
    });
  });

  describe('GET /repositories/:id - 仓库详情契约', () => {
    it('登录后访问自己的仓库应返回 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/repositories/${testRepoId}`)
        .set('Cookie', authCookie)
        .expect(200);

      const repo = res.body.data ?? res.body;
      expect(repo.id).toBe(testRepoId);
      expect(repo.fullName).toBe('contract-org/contract-test-repo');
    });

    it('访问不存在的仓库应返回 404', () => {
      return request(app.getHttpServer())
        .get('/repositories/non-existent-id-000')
        .set('Cookie', authCookie)
        .expect(404);
    });
  });

  describe('POST /repositories - 输入校验', () => {
    it('缺少所有必填字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .set('Cookie', authCookie)
        .send({})
        .expect(400);
    });

    it('platform 字段传入非法枚举值应返回 400', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .set('Cookie', authCookie)
        .send({ platform: 'INVALID_PLATFORM', owner: 'test-owner', repo: 'test-repo' })
        .expect(400);
    });

    it('缺少 owner 字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .set('Cookie', authCookie)
        .send({ platform: 'GITHUB', repo: 'test-repo' })
        .expect(400);
    });

    it('缺少 repo 字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .set('Cookie', authCookie)
        .send({ platform: 'GITHUB', owner: 'test-owner' })
        .expect(400);
    });
  });

  describe('GET /repositories/search - 搜索契约', () => {
    it('空 q 参数应返回 200 且结果为空数组', async () => {
      const res = await request(app.getHttpServer())
        .get('/repositories/search')
        .set('Cookie', authCookie)
        .query({ q: '' })
        .expect(200);

      const list = res.body.data ?? res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(0);
    });
  });
});
