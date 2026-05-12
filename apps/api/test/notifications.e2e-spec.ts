import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { PrismaClient, NotificationChannel } from '@repo-pulse/database';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-notification-test@repopulse.dev',
  password: 'notification-test-123',
  name: 'Notification E2E User',
};

describe('NotificationModule (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password })
      .expect(200);

    authCookie = (loginRes.headers['set-cookie'] as unknown as string[]).join('; ');
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /notifications/preferences should return a complete default structure', async () => {
    const res = await request(app.getHttpServer())
      .get('/notifications/preferences')
      .set('Cookie', authCookie)
      .expect(200);

    const data = res.body.data;
    expect(data.channels).toEqual([NotificationChannel.IN_APP]);
    expect(data.events).toEqual({
      highRisk: true,
      prUpdates: true,
      analysisComplete: true,
      weeklyReport: false,
    });
    expect(data).toHaveProperty('webhookUrl');
    expect(data).toHaveProperty('email');
  });

  it('POST /notifications/preferences should deep-merge partial updates', async () => {
    const updateRes = await request(app.getHttpServer())
      .post('/notifications/preferences')
      .set('Cookie', authCookie)
      .send({
        channels: [NotificationChannel.IN_APP, NotificationChannel.WEBHOOK],
        events: { weeklyReport: true },
        webhookUrl: 'http://127.0.0.1:9999/hook',
      })
      .expect(201);

    expect(updateRes.body.data.channels).toEqual([
      NotificationChannel.IN_APP,
      NotificationChannel.WEBHOOK,
    ]);
    expect(updateRes.body.data.events).toEqual({
      highRisk: true,
      prUpdates: true,
      analysisComplete: true,
      weeklyReport: true,
    });
    expect(updateRes.body.data.webhookUrl).toBe('http://127.0.0.1:9999/hook');
  });

  it('POST /notifications/send should mark unimplemented external channels as FAILED with a reason', async () => {
    const res = await request(app.getHttpServer())
      .post('/notifications/send')
      .set('Cookie', authCookie)
      .send({
        userId: testUserId,
        channel: NotificationChannel.EMAIL,
        title: 'Email contract check',
        content: 'This should fail honestly',
      })
      .expect(201);

    const notification = res.body.data;
    expect(notification.status).toBe('FAILED');
    expect(notification.metadata.failureReason).toBe('notification_email_missing');
  });
});
