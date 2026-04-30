import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import { PrismaClient, Platform, EventType } from '@repo-pulse/database';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../src/app.module';
import { EventProcessor } from '../src/modules/event/event.processor';
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
  let eventProcessor: EventProcessor;

  const webhookQueueAddMock = jest.fn().mockResolvedValue({ id: 'job-1' });
  const aiQueueAddMock = jest.fn().mockResolvedValue({ id: 'ai-job-1' });
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
      .overrideProvider(getQueueToken('webhook-events'))
      .useValue({ add: webhookQueueAddMock })
      .overrideProvider(getQueueToken('ai-analysis'))
      .useValue({ add: aiQueueAddMock })
      .overrideProvider(EventGateway)
      .useValue({ broadcastNewEvent: broadcastSpy })
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

    eventProcessor = moduleFixture.get(EventProcessor);
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

    expect(webhookQueueAddMock).toHaveBeenCalledTimes(1);
    const [jobName, jobData] = webhookQueueAddMock.mock.calls[0];
    expect(jobName).toBe('process-webhook-event');
    expect(jobData).toMatchObject({
      repositoryId: testRepoId,
      platform: 'github',
      eventType: 'PUSH',
    });

    // Step 2: 模拟 BullMQ Worker 调度 EventProcessor 处理该 Job
    await eventProcessor.process({
      data: jobData,
      id: 'flow-job-1',
    } as any);

    // 事件入库
    const stored = await prisma.event.findFirst({
      where: { repositoryId: testRepoId, externalId: 'commit-flow-sha-001' },
    });
    expect(stored).not.toBeNull();
    expect(stored?.type).toBe(EventType.PUSH);
    expect(stored?.author).toBe('Flow Bot');

    // EventService.create 是异步触发 post-create 任务的，等一个微任务 + 1 tick 让它跑完
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // WebSocket 广播入口被调用
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy.mock.calls[0][0]).toBe(testRepoId);
    expect(broadcastSpy.mock.calls[0][1]).toMatchObject({
      id: stored?.id,
      type: EventType.PUSH,
    });

    // AI 队列入队成功
    expect(aiQueueAddMock).toHaveBeenCalledTimes(1);
    expect(aiQueueAddMock.mock.calls[0][0]).toBe('analyze-event');
    expect(aiQueueAddMock.mock.calls[0][1]).toMatchObject({ eventId: stored?.id });
  });
});
