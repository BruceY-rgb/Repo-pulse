import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import type { Queue } from 'bullmq';
import { PrismaClient, Platform } from '@repo-pulse/database';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../src/app.module';
import { EventGateway } from '../src/modules/event/event.gateway';
import { AIService } from '../src/modules/ai/ai.service';
import { FilterService } from '../src/modules/filter/filter.service';
import { NotificationService } from '../src/modules/notification/notification.service';

const prisma = new PrismaClient();

const WEBHOOK_SECRET = 'e2e-flow-webhook-secret-abc456';
const GITHUB_EXTERNAL_ID = '888000777';

describe('Webhook full flow (e2e)', () => {
  let app: INestApplication;
  let testRepoId: string;
  let testUserId: string;
  let webhookQueue: Queue;

  // 这些下游服务用 spy 替代，避免真去调 LLM / 触发真 socket
  const aiTriggerSpy = jest.fn().mockResolvedValue(undefined);
  const broadcastSpy = jest.fn();

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: 'e2e-webhook-flow@repopulse.dev',
        name: 'Webhook Flow E2E User',
        passwordHash: 'unused-for-this-test',
      },
    });
    testUserId = user.id;

    const repo = await prisma.repository.create({
      data: {
        name: 'webhook-flow-repo',
        fullName: 'flow-org/webhook-flow-repo',
        platform: Platform.GITHUB,
        externalId: GITHUB_EXTERNAL_ID,
        url: 'https://github.com/flow-org/webhook-flow-repo',
        webhookSecret: WEBHOOK_SECRET,
      },
    });
    testRepoId = repo.id;

    await prisma.userRepository.create({
      data: { userId: testUserId, repositoryId: testRepoId, role: 'ADMIN' },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EventGateway)
      .useValue({ broadcastNewEvent: broadcastSpy })
      .overrideProvider(AIService)
      .useValue({ triggerAnalysis: aiTriggerSpy })
      .overrideProvider(FilterService)
      .useValue({ applyRules: jest.fn().mockResolvedValue({ action: 'INCLUDE' }) })
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

    // 获取队列引用，后续测试中每次创建新的 spy
    webhookQueue = moduleFixture.get<Queue>(getQueueToken('webhook-events'));
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.userRepository.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.repository.deleteMany({ where: { id: testRepoId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
    await app.close();
  });

  function sign(secret: string, body: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
  }

  function createQueueAddSpy() {
    return jest.spyOn(webhookQueue, 'add').mockResolvedValue({ id: 'job-1' } as any);
  }

  it('GitHub webhook 入站后，事件正确入队到 BullMQ', async () => {
    const addSpy = createQueueAddSpy();

    const payload = {
      repository: {
        id: parseInt(GITHUB_EXTERNAL_ID, 10),
        full_name: 'flow-org/webhook-flow-repo',
      },
      ref: 'refs/heads/main',
      after: 'commit-flow-sha-001',
      commits: [
        {
          message: 'flow test commit',
          author: { name: 'Flow Bot' },
        },
      ],
      sender: { login: 'flow-bot', avatar_url: 'https://avatar/flow-bot.png' },
    };
    const body = JSON.stringify(payload);
    const signature = sign(WEBHOOK_SECRET, body);

    // Webhook 入站后，应返回 201 并入队
    await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', signature)
      .send(body)
      .expect(200);

    // 验证事件被正确加入队列
    expect(addSpy).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = addSpy.mock.calls[0];
    expect(jobName).toBe('process-webhook-event');
    expect(jobData).toMatchObject({
      repositoryId: testRepoId,
      platform: 'github',
      eventType: 'PUSH',
    });
    expect(jobData.payload).toMatchObject({
      repository: { id: parseInt(GITHUB_EXTERNAL_ID, 10) },
      ref: 'refs/heads/main',
      after: 'commit-flow-sha-001',
    });

    addSpy.mockRestore();
  });

  it('GitHub webhook 签名验证失败时返回 400', async () => {
    const addSpy = createQueueAddSpy();

    const payload = {
      repository: {
        id: parseInt(GITHUB_EXTERNAL_ID, 10),
        full_name: 'flow-org/webhook-flow-repo',
      },
      ref: 'refs/heads/main',
    };
    const body = JSON.stringify(payload);
    // 使用错误的签名
    const invalidSignature = sign('wrong-secret', body);

    await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', invalidSignature)
      .send(body)
      .expect(400);

    expect(addSpy).not.toHaveBeenCalled();

    addSpy.mockRestore();
  });

  it('GitHub webhook 对未注册仓库返回 200 但不处理', async () => {
    const addSpy = createQueueAddSpy();

    const payload = {
      repository: {
        id: 999999999, // 不存在的仓库 ID
        full_name: 'unknown-org/unknown-repo',
      },
    };
    const body = JSON.stringify(payload);

    // Webhook 接收端点统一返回 200（不是标准的 REST 创建资源）
    await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .send(body)
      .expect(200);

    expect(addSpy).not.toHaveBeenCalled();

    addSpy.mockRestore();
  });

  it('PR opened 事件正确识别并入队', async () => {
    const addSpy = createQueueAddSpy();

    const payload = {
      action: 'opened',
      repository: {
        id: parseInt(GITHUB_EXTERNAL_ID, 10),
        full_name: 'flow-org/webhook-flow-repo',
      },
      pull_request: {
        id: 12345,
        title: 'Add new feature',
        body: 'This PR adds a new feature',
        number: 42,
        html_url: 'https://github.com/flow-org/webhook-flow-repo/pull/42',
        user: { login: 'contributor', avatar_url: 'https://avatar/contributor.png' },
      },
    };
    const body = JSON.stringify(payload);
    const signature = sign(WEBHOOK_SECRET, body);

    await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', signature)
      .send(body)
      .expect(200);

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = addSpy.mock.calls[0];
    expect(jobName).toBe('process-webhook-event');
    expect(jobData.eventType).toBe('PR_OPENED');

    addSpy.mockRestore();
  });

  it('Issue closed 事件正确识别并入队', async () => {
    const addSpy = createQueueAddSpy();

    const payload = {
      action: 'closed',
      repository: {
        id: parseInt(GITHUB_EXTERNAL_ID, 10),
        full_name: 'flow-org/webhook-flow-repo',
      },
      issue: {
        id: 67890,
        title: 'Fix bug',
        body: 'This fixes a bug',
        number: 15,
        html_url: 'https://github.com/flow-org/webhook-flow-repo/issues/15',
        user: { login: 'bugfixer', avatar_url: 'https://avatar/bugfixer.png' },
      },
    };
    const body = JSON.stringify(payload);
    const signature = sign(WEBHOOK_SECRET, body);

    await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'issues')
      .set('x-hub-signature-256', signature)
      .send(body)
      .expect(200);

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [, jobData] = addSpy.mock.calls[0];
    expect(jobData.eventType).toBe('ISSUE_CLOSED');

    addSpy.mockRestore();
  });
});
