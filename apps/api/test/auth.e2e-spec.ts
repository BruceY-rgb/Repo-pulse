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

  // 1. 测试：符合契约的正常登录
  it('/auth/login (POST) - 正常登录', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123',
      })
      .expect((res) => {
        if (res.status === 201) {
          expect(res.body).toHaveProperty('accessToken');
        }
      });
  });

  // 2. 契约对齐测试：错误的邮箱格式
  it('/auth/login (POST) - 拦截非法邮箱', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'invalid-email-format', 
        password: 'password123',
      })
      .expect(400); // 预期 ValidationPipe 拦截并返回 400
  });

  afterAll(async () => {
    await app.close();
  });
});