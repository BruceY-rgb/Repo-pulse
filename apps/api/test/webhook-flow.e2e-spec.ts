import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import type { Queue } from 'bullmq';
import { PrismaClient, Platform, EventType } from '@repo-pulse/database';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../src/app.module';
import { EventGateway } from '../src/modules/event/event.gateway';
import { AIService } from '../src/modules/ai/ai.service';
import { FilterService } from '../src/modules/filter/filter.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { EventService } from '../src/modules/event/event.service';

const prisma = new PrismaClient();

const WEBHOOK_SECRET = 'e2e-flow-webhook-secret-abc456';
const GITHUB_EXTERNAL_ID = '888000777';

describe('Webhook full flow (e2e)', () => {
  let app: INestApplication;
  let testRepoId: string;
  let testUserId: string;
  let webhookQueueAddSpy: jest.SpyInstance;

  // 这些下游服务用 spy 替代，避免真去调 LLM / 触发真 socket
  const aiTriggerSpy = jest.fn().mockResolvedValue(undefined);
  const broadcastSpy = jest.fn();

  // Mock EventService.create 返回假事件，避免 Prisma 外键约束问题
  const eventServiceCreateSpy = jest.fn();

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
      .overrideProvider(EventService)
      .useValue({
        create: eventServiceCreateSpy.mockResolvedValue({
          id: 'evt-webhook-flow-001',
          repositoryId: testRepoId,
          type: EventType.PUSH,
          action: 'push',
          title: 'Push to main',
          body: 'flow test commit',
          author: 'Flow Bot',
          authorAvatar: 'https://avatar/flow-bot.png',
          externalId: 'commit-flow-sha-001',
          externalUrl: null,
          createdAt: new Date(),
        }),
        findByExternalId: jest.fn().mockResolvedValue(null),
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

    // 真实 BullMQ Queue（CI 已起 Redis），改用 spy 探测 add 调用
    const webhookQueue = moduleFixture.get<Queue>(getQueueToken('webhook-events'));
    webhookQueueAddSpy = jest.spyOn(webhookQueue, 'add').mockResolvedValue({ id: 'job-1' } as any);
  });

  afterAll(async () => {
    if (webhookQueueAddSpy) {
      webhookQueueAddSpy.mockRestore();
    }
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

  it('GitHub webhook 入站后，事件入库、WebSocket 广播入口可调用、AI 队列入队成功', async () => {
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

    // Step 1: webhook 入站后，应入队
    await request(app.getHttpServer())
      .post('/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-hub-signature-256', signature)
      .send(body)
      .expect(201);

    expect(webhookQueueAddSpy).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = webhookQueueAddSpy.mock.calls[0];
    expect(jobName).toBe('process-webhook-event');
    expect(jobData).toMatchObject({
      repositoryId: testRepoId,
      platform: 'github',
      eventType: 'PUSH',
    });

    // Step 2: EventService.create 被调用（通过 BullMQ Worker 调度）
    // EventService.create 异步触发 post-create 任务，等其完成
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 验证 EventService.create 被调用（参数包含正确的 repositoryId 和 eventType）
    expect(eventServiceCreateSpy).toHaveBeenCalledTimes(1);
    expect(eventServiceCreateSpy.mock.calls[0][0]).toMatchObject({
      repositoryId: testRepoId,
      type: EventType.PUSH,
      externalId: 'commit-flow-sha-001',
    });

    // WebSocket 广播入口被调用
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy.mock.calls[0][0]).toBe(testRepoId);
    expect(broadcastSpy.mock.calls[0][1]).toMatchObject({
      id: 'evt-webhook-flow-001',
      type: EventType.PUSH,
    });

    // AI 队列入队入口被调用（AIService.triggerAnalysis 内部会做 aiQueue.add）
    expect(aiTriggerSpy).toHaveBeenCalledTimes(1);
    expect(aiTriggerSpy).toHaveBeenCalledWith('evt-webhook-flow-001');
  });
});
