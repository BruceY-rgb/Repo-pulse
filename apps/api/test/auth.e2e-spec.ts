import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('非法邮箱格式应返回 400', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: 'password123' })
        .expect(400);
    });

    it('缺少必填字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com' })
        .expect(400);
    });

    it('凭证错误应返回 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'wrong-password' })
        .expect(401);
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
    it('应返回 200 并清除 Cookie', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
        });
    });
  });

  describe('POST /auth/github/config', () => {
    it('传入有效参数应返回 200', () => {
      return request(app.getHttpServer())
        .post('/auth/github/config')
        .send({ clientId: 'test-client-id', clientSecret: 'test-client-secret' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
        });
    });

    it('缺少参数应返回 401', () => {
      return request(app.getHttpServer())
        .post('/auth/github/config')
        .send({ clientId: '' })
        .expect(401);
    });
  });
});
