import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('RepositoryModule (e2e)', () => {
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

  describe('GET /repositories', () => {
    it('未登录应返回 401', () => {
      return request(app.getHttpServer()).get('/repositories').expect(401);
    });
  });

  describe('POST /repositories', () => {
    it('未登录应返回 401', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .send({ fullName: 'owner/repo', platform: 'GITHUB' })
        .expect(401);
    });
  });

  describe('GET /repositories/search', () => {
    it('未登录应返回 401', () => {
      return request(app.getHttpServer())
        .get('/repositories/search')
        .query({ q: 'nestjs' })
        .expect(401);
    });
  });
});
