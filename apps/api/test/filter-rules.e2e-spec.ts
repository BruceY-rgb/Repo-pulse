import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@repo-pulse/database';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-filter-rules@repopulse.dev',
  password: 'filter-test-123',
  name: 'Filter Rules E2E Test User',
};

describe('FilterModule (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
  let testUserId: string;
  let createdRuleId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        passwordHash: await bcrypt.hash(TEST_USER.password, 10),
      },
    });
    testUserId = user.id;

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
    authCookie = loginRes.headers['set-cookie']?.[0] ?? '';
  }, 60000);

  afterAll(async () => {
    await prisma.filterRule.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  // ── 未认证访问 ────────────────────────────────────────────────────────────
  describe('未认证访问', () => {
    it('GET /filters 无 Cookie 应返回 401', () => {
      return request(app.getHttpServer()).get('/filters').expect(401);
    });

    it('POST /filters 无 Cookie 应返回 401', () => {
      return request(app.getHttpServer())
        .post('/filters')
        .send({ name: '测试', conditions: [], action: 'EXCLUDE' })
        .expect(401);
    });
  });

  // ── GET /filters ──────────────────────────────────────────────────────────
  describe('GET /filters', () => {
    it('新用户应返回空规则列表', async () => {
      const res = await request(app.getHttpServer())
        .get('/filters')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });
  });

  // ── POST /filters ─────────────────────────────────────────────────────────
  describe('POST /filters — 创建规则', () => {
    it('创建 EXCLUDE 规则应返回 201 和新规则', async () => {
      const res = await request(app.getHttpServer())
        .post('/filters')
        .set('Cookie', authCookie)
        .send({
          name: 'E2E 测试排除规则',
          conditions: [{ field: 'author', operator: 'eq', value: 'bot' }],
          action: 'EXCLUDE',
          isActive: true,
          priority: 10,
        })
        .expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.name).toBe('E2E 测试排除规则');
      expect(res.body.data.action).toBe('EXCLUDE');
      createdRuleId = res.body.data.id;
    });

    it('缺少 name 字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/filters')
        .set('Cookie', authCookie)
        .send({ conditions: [], action: 'EXCLUDE' })
        .expect(400);
    });

    it('缺少 action 字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/filters')
        .set('Cookie', authCookie)
        .send({ name: '无 action 规则', conditions: [] })
        .expect(400);
    });
  });

  // ── GET /filters（创建后）────────────────────────────────────────────────
  describe('GET /filters — 创建后', () => {
    it('应返回刚创建的规则', async () => {
      const res = await request(app.getHttpServer())
        .get('/filters')
        .set('Cookie', authCookie)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const rule = res.body.data.find((r: any) => r.id === createdRuleId);
      expect(rule).toBeDefined();
      expect(rule.name).toBe('E2E 测试排除规则');
    });
  });

  // ── PUT /filters/:id ──────────────────────────────────────────────────────
  describe('PUT /filters/:id — 更新规则', () => {
    it('更新规则名称应成功', async () => {
      const res = await request(app.getHttpServer())
        .put(`/filters/${createdRuleId}`)
        .set('Cookie', authCookie)
        .send({ name: '已更新的规则名称' })
        .expect(200);

      expect(res.body.data.name).toBe('已更新的规则名称');
    });

    it('更新不存在的规则应返回 404', () => {
      return request(app.getHttpServer())
        .put('/filters/non-existent-rule-id')
        .set('Cookie', authCookie)
        .send({ name: '更新' })
        .expect(404);
    });
  });

  // ── POST /filters/test ────────────────────────────────────────────────────
  describe('POST /filters/test — 测试规则匹配', () => {
    it('条件匹配时应返回 matched=true', async () => {
      const res = await request(app.getHttpServer())
        .post('/filters/test')
        .set('Cookie', authCookie)
        .send({
          conditions: [{ field: 'author', operator: 'eq', value: 'alice' }],
          action: 'EXCLUDE',
          event: { type: 'PUSH', author: 'alice', riskLevel: 'LOW', body: 'fix typo', repository: 'org/repo' },
        })
        .expect(201);

      expect(res.body.data.matched).toBe(true);
      expect(res.body.data.action).toBe('EXCLUDE');
    });

    it('条件不匹配时应返回 matched=false', async () => {
      const res = await request(app.getHttpServer())
        .post('/filters/test')
        .set('Cookie', authCookie)
        .send({
          conditions: [{ field: 'author', operator: 'eq', value: 'nobody' }],
          event: { type: 'PUSH', author: 'alice', riskLevel: 'LOW', body: 'fix typo', repository: 'org/repo' },
        })
        .expect(201);

      expect(res.body.data.matched).toBe(false);
      expect(res.body.data.action).toBeNull();
    });

    it('空请求体应返回 400，而不是 500', () => {
      return request(app.getHttpServer())
        .post('/filters/test')
        .set('Cookie', authCookie)
        .send({})
        .expect(400);
    });

    it('operator=in 但 value 不是数组时应返回 400', () => {
      return request(app.getHttpServer())
        .post('/filters/test')
        .set('Cookie', authCookie)
        .send({
          conditions: [{ field: 'author', operator: 'in', value: 'alice' }],
          event: { type: 'PUSH', author: 'alice', repository: 'org/repo' },
        })
        .expect(400);
    });
  });

  // ── DELETE /filters/:id ───────────────────────────────────────────────────
  describe('DELETE /filters/:id — 删除规则', () => {
    it('删除已有规则应返回 200 success=true', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/filters/${createdRuleId}`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.data.success).toBe(true);
    });

    it('删除后 GET /filters 不再包含该规则', async () => {
      const res = await request(app.getHttpServer())
        .get('/filters')
        .set('Cookie', authCookie)
        .expect(200);

      const rule = res.body.data.find((r: any) => r.id === createdRuleId);
      expect(rule).toBeUndefined();
    });

    it('删除不存在的规则应返回 404', () => {
      return request(app.getHttpServer())
        .delete(`/filters/${createdRuleId}`)
        .set('Cookie', authCookie)
        .expect(404);
    });
  });
});
