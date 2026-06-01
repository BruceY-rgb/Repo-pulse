import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import {
  PrismaClient,
  Platform,
  RepositoryAccessMode,
  RepositoryAccessLevel,
} from '@repo-pulse/database';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

const TEST_USER = {
  email: 'e2e-repo-contract@repopulse.dev',
  password: 'repo-test-123',
  name: 'Repo Contract Test User',
};

describe('RepositoryModule (e2e)', () => {
  let app: INestApplication;
  let authCookie: string;
  let testUserId: string;
  let editableRepoId: string;
  let monitorRepoId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_USER.email,
        name: TEST_USER.name,
        passwordHash: await bcrypt.hash(TEST_USER.password, 10),
      },
    });
    testUserId = user.id;

    const editableRepo = await prisma.repository.create({
      data: {
        name: 'contract-test-repo',
        fullName: 'contract-org/contract-test-repo',
        platform: Platform.GITHUB,
        externalId: '777000333',
        url: 'https://github.com/contract-org/contract-test-repo',
      },
    });
    editableRepoId = editableRepo.id;

    const monitorRepo = await prisma.repository.create({
      data: {
        name: 'monitor-only-repo',
        fullName: 'contract-org/monitor-only-repo',
        platform: Platform.GITHUB,
        externalId: '777000335',
        url: 'https://github.com/contract-org/monitor-only-repo',
      },
    });
    monitorRepoId = monitorRepo.id;

    await prisma.userRepository.createMany({
      data: [
        {
          userId: testUserId,
          repositoryId: editableRepoId,
          role: 'ADMIN',
          accessMode: RepositoryAccessMode.EDITABLE,
          accessLevel: RepositoryAccessLevel.WRITE,
        },
        {
          userId: testUserId,
          repositoryId: monitorRepoId,
          role: 'VIEWER',
          accessMode: RepositoryAccessMode.MONITOR,
          accessLevel: RepositoryAccessLevel.READ,
        },
      ],
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
    await prisma.userRepository.deleteMany({
      where: { repositoryId: { in: [editableRepoId, monitorRepoId] } },
    });
    await prisma.repository.deleteMany({
      where: { externalId: { in: ['777000333', '777000335', '777000334'] } },
    });
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('unauthenticated access', () => {
    it('GET /repositories returns 401', () => {
      return request(app.getHttpServer()).get('/repositories').expect(401);
    });

    it('POST /repositories returns 401', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .send({ fullName: 'owner/repo', platform: 'GITHUB' })
        .expect(401);
    });

    it('GET /repositories/search returns 401', () => {
      return request(app.getHttpServer())
        .get('/repositories/search')
        .query({ q: 'nestjs' })
        .expect(401);
    });
  });

  describe('GET /repositories', () => {
    it('returns the current user repositories', async () => {
      const res = await request(app.getHttpServer())
        .get('/repositories')
        .set('Cookie', authCookie)
        .expect(200);

      const list = res.body.data ?? res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list.map((repo: { id: string }) => repo.id)).toEqual(
        expect.arrayContaining([editableRepoId, monitorRepoId]),
      );
    });

    it('includes current user access metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/repositories')
        .set('Cookie', authCookie)
        .expect(200);

      const list = res.body.data ?? res.body;
      const editableRepo = list.find((repo: { id: string }) => repo.id === editableRepoId);
      const monitorRepo = list.find((repo: { id: string }) => repo.id === monitorRepoId);

      expect(editableRepo.isEditable).toBe(true);
      expect(editableRepo.canOperate).toBe(true);
      expect(monitorRepo.isEditable).toBe(false);
      expect(monitorRepo.canOperate).toBe(false);
      expect(editableRepo.webhookSecret).toBeNull();
    });
  });

  describe('GET /repositories/:id', () => {
    it('returns repository details with access metadata', async () => {
      const res = await request(app.getHttpServer())
        .get(`/repositories/${editableRepoId}`)
        .set('Cookie', authCookie)
        .expect(200);

      const repo = res.body.data ?? res.body;
      expect(repo.id).toBe(editableRepoId);
      expect(repo.fullName).toBe('contract-org/contract-test-repo');
      expect(repo.canOperate).toBe(true);
    });

    it('returns 404 for a missing repository', () => {
      return request(app.getHttpServer())
        .get('/repositories/non-existent-id-000')
        .set('Cookie', authCookie)
        .expect(404);
    });
  });

  describe('repository permissions', () => {
    it('rejects monitor-only repository updates', () => {
      return request(app.getHttpServer())
        .patch(`/repositories/${monitorRepoId}`)
        .set('Cookie', authCookie)
        .send({ isActive: false })
        .expect(403);
    });

    it('rejects monitor-only repository sync', () => {
      return request(app.getHttpServer())
        .post(`/repositories/${monitorRepoId}/sync`)
        .set('Cookie', authCookie)
        .expect(403);
    });
  });

  describe('POST /repositories validation', () => {
    it('returns 400 when required fields are missing', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .set('Cookie', authCookie)
        .send({})
        .expect(400);
    });

    it('returns 400 for invalid platform', () => {
      return request(app.getHttpServer())
        .post('/repositories')
        .set('Cookie', authCookie)
        .send({ platform: 'INVALID_PLATFORM', owner: 'test-owner', repo: 'test-repo' })
        .expect(400);
    });
  });

  describe('GET /repositories/search', () => {
    it('returns an empty list for an empty query', async () => {
      const res = await request(app.getHttpServer())
        .get('/repositories/search')
        .set('Cookie', authCookie)
        .query({ q: '' })
        .expect(200);

      const list = res.body.data ?? res.body;
      expect(Array.isArray(list)).toBe(true);
      expect(list).toHaveLength(0);
    });
  });

  describe('DELETE /repositories/:id', () => {
    it('deletes an editable repository with its membership', async () => {
      const deleteRepo = await prisma.repository.create({
        data: {
          name: 'contract-delete-repo',
          fullName: 'contract-org/contract-delete-repo',
          platform: Platform.GITHUB,
          externalId: '777000334',
          url: 'https://github.com/contract-org/contract-delete-repo',
        },
      });

      await prisma.userRepository.create({
        data: {
          userId: testUserId,
          repositoryId: deleteRepo.id,
          role: 'ADMIN',
          accessMode: RepositoryAccessMode.EDITABLE,
          accessLevel: RepositoryAccessLevel.WRITE,
        },
      });

      await request(app.getHttpServer())
        .delete(`/repositories/${deleteRepo.id}`)
        .set('Cookie', authCookie)
        .expect(200);

      const repository = await prisma.repository.findUnique({
        where: { id: deleteRepo.id },
      });
      const relation = await prisma.userRepository.findUnique({
        where: {
          userId_repositoryId: {
            userId: testUserId,
            repositoryId: deleteRepo.id,
          },
        },
      });

      expect(repository).toBeNull();
      expect(relation).toBeNull();
    });
  });
});
