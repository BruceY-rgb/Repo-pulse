import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import { PrismaClient, Platform } from '@repo-pulse/database';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const WEBHOOK_SECRET = 'e2e-test-webhook-secret-xyz789';
const GITHUB_EXTERNAL_ID = '888000444';

describe('WebhookModule (e2e)', () => {
  let app: INestApplication;
  let testRepoId: string;

  beforeAll(async () => {
    const repo = await prisma.repository.create({
      data: {
        name: 'webhook-test-repo',
        fullName: 'webhook-org/webhook-test-repo',
        platform: Platform.GITHUB,
        externalId: GITHUB_EXTERNAL_ID,
        url: 'https://github.com/webhook-org/webhook-test-repo',
        webhookSecret: WEBHOOK_SECRET,
      },
    });
    testRepoId = repo.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.use('/webhooks', (req: Request & { rawBody?: Buffer }, _res: Response, next: NextFunction) => {
      if (!req.rawBody && req.body) {
        req.rawBody = Buffer.from(JSON.stringify(req.body));
      }
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await prisma.repository.deleteMany({ where: { externalId: GITHUB_EXTERNAL_ID } });
    await prisma.$disconnect();
    await app.close();
  });

  function sign(secret: string, body: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
  }

  describe('POST /webhooks/github - 基础校验', () => {
    it('Payload 缺少 repository 字段应返回 400', () => {
      return request(app.getHttpServer())
        .post('/webhooks/github')
        .set('x-github-event', 'push')
        .send({ ref: 'refs/heads/main' })
        .expect(400);
    });

    it('未注册仓库收到 Webhook 应返回 200（接受但忽略）', () => {
      return request(app.getHttpServer())
        .post('/webhooks/github')
        .set('x-github-event', 'push')
        .send({
          repository: { id: 99999999, full_name: 'unknown/repo' },
          ref: 'refs/heads/main',
        })
        .expect(200);
    });
  });

  describe('POST /webhooks/github - HMAC 签名验证', () => {
    const PAYLOAD = {
      repository: {
        id: parseInt(GITHUB_EXTERNAL_ID, 10),
        full_name: 'webhook-org/webhook-test-repo',
      },
      ref: 'refs/heads/main',
      commits: [],
    };

    it('正确签名应返回 200', () => {
      const body = JSON.stringify(PAYLOAD);
      const signature = sign(WEBHOOK_SECRET, body);

      return request(app.getHttpServer())
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('x-github-event', 'push')
        .set('x-hub-signature-256', signature)
        .send(body)
        .expect(200);
    });

    it('错误签名应返回 400', () => {
      const body = JSON.stringify(PAYLOAD);

      return request(app.getHttpServer())
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('x-github-event', 'push')
        .set('x-hub-signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
        .send(body)
        .expect(400);
    });

    it('配置了 webhookSecret 但缺少签名头应返回 400', () => {
      const body = JSON.stringify(PAYLOAD);

      return request(app.getHttpServer())
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('x-github-event', 'push')
        .send(body)
        .expect(400);
    });

    it('篡改 Payload 后的签名应返回 400', () => {
      const originalBody = JSON.stringify(PAYLOAD);
      const signature = sign(WEBHOOK_SECRET, originalBody);

      const tamperedBody = JSON.stringify({ ...PAYLOAD, ref: 'refs/heads/malicious' });

      return request(app.getHttpServer())
        .post('/webhooks/github')
        .set('Content-Type', 'application/json')
        .set('x-github-event', 'push')
        .set('x-hub-signature-256', signature)
        .send(tamperedBody)
        .expect(400);
    });
  });

  it('测试仓库已成功在数据库中创建', () => {
    expect(testRepoId).toBeDefined();
    expect(typeof testRepoId).toBe('string');
  });
});
