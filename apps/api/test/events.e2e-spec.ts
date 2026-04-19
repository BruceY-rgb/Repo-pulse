import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { PrismaClient, Platform } from '@repo-pulse/database';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-events-test@repopulse.dev',
  password: 'events-test-123',
  name: 'Events Contract Test User',
};

describe('EventModule (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
  let testUserId: string;
  let testRepoId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        passwordHash: await bcrypt.hash(TEST_USER.password, 10),
      },
    });
    testUserId = user.id;

    const repo = await prisma.repository.create({
      data: {
        name: 'events-test-repo',
        fullName: 'contract-org/events-test-repo',
        platform: Platform.GITHUB,
        externalId: '777000444',
        url: 'https://github.com/contract-org/events-test-repo',
      },
    });
    testRepoId = repo.id;

    await prisma.userRepository.create({
      data: { userId: testUserId, repositoryId: testRepoId, role: 'ADMIN' },
    });

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
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    authCookie = (loginRes.headers['set-cookie'] as unknown as string[]).join('; ');
  });

  afterAll(async () => {
    await prisma.userRepository.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.repository.deleteMany({ where: { externalId: '777000444' } });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('GET /events with valid repositoryId returns 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/events')
      .set('Cookie', authCookie)
      .query({ repositoryId: testRepoId, page: 1, pageSize: 5 })
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total');
  });

  it('GET /events without repositoryId returns explicit 400 JSON', async () => {
    const res = await request(app.getHttpServer())
      .get('/events')
      .set('Cookie', authCookie)
      .expect(400);

    expect(res.body.code).toBe(400);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBeDefined();
    expect(res.body.message).toBeDefined();
  });

  it('GET /events with invalid repositoryId format returns Invalid repositoryId', async () => {
    const res = await request(app.getHttpServer())
      .get('/events')
      .set('Cookie', authCookie)
      .query({ repositoryId: 'bad-id' })
      .expect(400);

    expect(res.body.error).toBe('Invalid repositoryId');
    expect(res.body.message).toBe('Invalid repositoryId');
  });

  it('GET /events with non-existent repositoryId returns 404 JSON', async () => {
    const res = await request(app.getHttpServer())
      .get('/events')
      .set('Cookie', authCookie)
      .query({ repositoryId: 'czzzzzzzzzzzzzzzzzzzzzzzz' })
      .expect(404);

    expect(res.body.code).toBe(404);
    expect(res.body.error).toBe('Not Found');
    expect(res.body.message).toBe('Repository not found');
  });

  it('GET /events/stats with valid repositoryId returns 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/events/stats')
      .set('Cookie', authCookie)
      .query({ repositoryId: testRepoId })
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('byType');
  });

  it('GET /events/stats with invalid repositoryId format returns 400 JSON', async () => {
    const res = await request(app.getHttpServer())
      .get('/events/stats')
      .set('Cookie', authCookie)
      .query({ repositoryId: 'bad-id' })
      .expect(400);

    expect(res.body.code).toBe(400);
    expect(res.body.error).toBe('Invalid repositoryId');
    expect(res.body.message).toBe('Invalid repositoryId');
  });

  it('GET /events/stats with non-existent repositoryId returns 404 JSON', async () => {
    const res = await request(app.getHttpServer())
      .get('/events/stats')
      .set('Cookie', authCookie)
      .query({ repositoryId: 'czzzzzzzzzzzzzzzzzzzzzzzz' })
      .expect(404);

    expect(res.body.code).toBe(404);
    expect(res.body.error).toBe('Not Found');
    expect(res.body.message).toBe('Repository not found');
  });
});
