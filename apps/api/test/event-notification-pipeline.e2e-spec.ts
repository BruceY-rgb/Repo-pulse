import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import cookieParser from 'cookie-parser';
import {
  PrismaClient,
  Platform,
  EventType,
  FilterAction,
  NotificationChannel,
  NotificationStatus,
} from '@repo-pulse/database';
import { AppModule } from '../src/app.module';
import { EventService } from '../src/modules/event/event.service';
import { EventGateway } from '../src/modules/event/event.gateway';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-event-pipeline@repopulse.dev',
  name: 'Event Pipeline E2E User',
};

describe('Event → Notification pipeline (e2e)', () => {
  let app: INestApplication;
  let testUserId: string;
  let testRepoId: string;
  let eventService: EventService;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        passwordHash: 'unused-for-this-test',
        // 默认 preferences 为 {}, NotificationService.getPreferences 将返回 IN_APP 默认值
      },
    });
    testUserId = user.id;

    const repo = await prisma.repository.create({
      data: {
        name: 'pipeline-test-repo',
        fullName: 'pipeline-org/pipeline-test-repo',
        platform: Platform.GITHUB,
        externalId: 'pipeline-555000111',
        url: 'https://github.com/pipeline-org/pipeline-test-repo',
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
      .useValue({ add: jest.fn().mockResolvedValue({ id: 'job' }) })
      .overrideProvider(getQueueToken('ai-analysis'))
      .useValue({ add: jest.fn().mockResolvedValue({ id: 'ai-job' }) })
      .overrideProvider(EventGateway)
      .useValue({ broadcastNewEvent: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    eventService = moduleFixture.get(EventService);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: testUserId } });
    await prisma.event.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.filterRule.deleteMany({ where: { userId: testUserId } });
    await prisma.userRepository.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.repository.deleteMany({ where: { id: testRepoId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
    await app.close();
  });

  // 每个用例之间清理通知与过滤规则，避免互相污染
  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: testUserId } });
    await prisma.filterRule.deleteMany({ where: { userId: testUserId } });
  });

  it('未命中过滤规则时，按用户偏好生成站内通知', async () => {
    const event = await eventService.create({
      repositoryId: testRepoId,
      type: EventType.PUSH,
      action: 'push',
      title: 'Pipeline allow push',
      body: 'normal commit body',
      author: 'allowed-author',
      externalId: 'allow-evt-001',
    });

    // EventService.create 异步触发后置任务，等待其完成
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const notifications = await prisma.notification.findMany({
      where: { userId: testUserId, eventId: event.id },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].channel).toBe(NotificationChannel.IN_APP);
    expect(notifications[0].status).toBe(NotificationStatus.SENT);
    expect(notifications[0].title).toBe('Pipeline allow push');
  });

  it('被 EXCLUDE 规则命中时不生成站内通知', async () => {
    // 创建一条 EXCLUDE 规则，匹配 author = blocked-author
    await prisma.filterRule.create({
      data: {
        userId: testUserId,
        name: 'block author',
        action: FilterAction.EXCLUDE,
        isActive: true,
        priority: 100,
        conditions: [
          {
            field: 'author',
            operator: 'eq',
            value: 'blocked-author',
          },
        ] as unknown as object,
      },
    });

    const event = await eventService.create({
      repositoryId: testRepoId,
      type: EventType.PUSH,
      action: 'push',
      title: 'Pipeline blocked push',
      body: 'this should be filtered out',
      author: 'blocked-author',
      externalId: 'block-evt-001',
    });

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const notifications = await prisma.notification.findMany({
      where: { userId: testUserId, eventId: event.id },
    });

    expect(notifications).toHaveLength(0);

    // 但事件本身仍然落库
    const stored = await prisma.event.findUnique({ where: { id: event.id } });
    expect(stored).not.toBeNull();
  });
});
