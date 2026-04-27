import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@repo-pulse/database';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-auth-test@repopulse.dev',
  password: 'test-password-123',
  name: 'E2E Auth Test User',
};

describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  let testUserId: string;

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
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /auth/login - 输入校验', () => {
    it('非法邮箱格式应返回 400', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('缺少 password 字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email })
        .expect(400);
    });

    it('密码长度不足 6 位应返回 400', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: '123' })
        .expect(400);
    });
  });

  describe('POST /auth/login - 认证失败', () => {
    it('不存在的用户应返回 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@repopulse.dev', password: 'password123' })
        .expect(401);
    });

    it('密码错误应返回 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('POST /auth/login - 登录成功', () => {
    it('应返回 200 并在 Cookie 中设置 HttpOnly access_token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(200);

      const cookies: string[] = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();

      const accessTokenCookie = cookies.find((c) => c.startsWith('access_token='));
      expect(accessTokenCookie).toBeDefined();
      expect(accessTokenCookie).toMatch(/HttpOnly/i);
    });

    it('登录成功后用 Cookie 访问 /auth/me 应返回当前用户信息', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: TEST_USER.email, password: TEST_USER.password })
        .expect(200);

      const cookies = loginRes.headers['set-cookie'] as unknown as string[];
      const cookieHeader = cookies.join('; ');

      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', cookieHeader)
        .expect(200);

      const userData = meRes.body.data ?? meRes.body;
      expect(userData.email).toBe(TEST_USER.email);
      expect(userData.name).toBe(TEST_USER.name);
      expect(userData.passwordHash).toBeUndefined();
    });
  });

  describe('GET /auth/me', () => {
    it('未携带 Token 应返回 401', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('无 Cookie 应返回 401', () => {
      return request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('应返回 200 并清除 Cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .expect(200);

      const cookies: string[] = res.headers['set-cookie'] as unknown as string[] ?? [];
      const accessCookie = cookies.find((c) => c.startsWith('access_token='));
      if (accessCookie) {
        expect(accessCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
      }
    });
  });

  it('testUserId 已写入', () => {
    expect(testUserId).toBeDefined();
  });
});
