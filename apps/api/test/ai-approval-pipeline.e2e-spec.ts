import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import {
  PrismaClient,
  Platform,
  EventType,
  RiskLevel,
  AnalysisStatus,
  ApprovalStatus,
} from '@repo-pulse/database';
import { AppModule } from '../src/app.module';
import { ApprovalService } from '../src/modules/approval/approval.service';
import { EventGateway } from '../src/modules/event/event.gateway';
import { AIService } from '../src/modules/ai/ai.service';

const prisma = new PrismaClient();

const TEST_USER_EMAIL = 'e2e-ai-approval@repopulse.dev';

describe('AI analysis → Approval pipeline (e2e)', () => {
  let app: INestApplication;
  let testUserId: string;
  let testRepoId: string;
  let approvalService: ApprovalService;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: TEST_USER_EMAIL,
        name: 'AI Approval E2E User',
        passwordHash: 'unused-for-this-test',
      },
    });
    testUserId = user.id;

    const repo = await prisma.repository.create({
      data: {
        name: 'ai-approval-repo',
        fullName: 'ai-org/ai-approval-repo',
        platform: Platform.GITHUB,
        externalId: 'ai-approval-555000222',
        url: 'https://github.com/ai-org/ai-approval-repo',
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
      .useValue({ broadcastNewEvent: jest.fn() })
      .overrideProvider(AIService)
      .useValue({ triggerAnalysis: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    approvalService = moduleFixture.get(ApprovalService);
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { event: { repositoryId: testRepoId } } });
    await prisma.aIAnalysis.deleteMany({ where: { event: { repositoryId: testRepoId } } });
    await prisma.event.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.userRepository.deleteMany({ where: { repositoryId: testRepoId } });
    await prisma.repository.deleteMany({ where: { id: testRepoId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
    await app.close();
  });

  async function seedEventWithAnalysis(opts: {
    externalId: string;
    riskLevel: RiskLevel;
    summary: string;
  }) {
    const event = await prisma.event.create({
      data: {
        repositoryId: testRepoId,
        type: EventType.PR_OPENED,
        action: 'opened',
        title: `seeded ${opts.riskLevel}`,
        body: opts.summary,
        author: 'seed-bot',
        externalId: opts.externalId,
      },
    });

    await prisma.aIAnalysis.create({
      data: {
        eventId: event.id,
        model: 'test-model',
        status: AnalysisStatus.COMPLETED,
        summary: opts.summary,
        riskLevel: opts.riskLevel,
        categories: [],
        keyChanges: [],
        suggestions: [],
        tokensUsed: 0,
        latencyMs: 0,
      },
    });

    return event;
  }

  it.each([RiskLevel.HIGH, RiskLevel.CRITICAL])(
    'AI 分析为 %s 时自动创建 PENDING 审批',
    async (riskLevel) => {
      const event = await seedEventWithAnalysis({
        externalId: `auto-approval-${riskLevel}`,
        riskLevel,
        summary: `${riskLevel} risk summary`,
      });

      const approval = await approvalService.createFromAIAnalysis(event.id);

      expect(approval).not.toBeNull();
      expect(approval.eventId).toBe(event.id);
      expect(approval.status).toBe(ApprovalStatus.PENDING);
      expect(approval.originalContent).toBe(`${riskLevel} risk summary`);

      const persisted = await prisma.approval.findFirst({ where: { eventId: event.id } });
      expect(persisted).not.toBeNull();
      expect(persisted?.status).toBe(ApprovalStatus.PENDING);
    },
  );

  it.each([RiskLevel.LOW, RiskLevel.MEDIUM])(
    'AI 分析为 %s 时不创建审批',
    async (riskLevel) => {
      const event = await seedEventWithAnalysis({
        externalId: `no-approval-${riskLevel}`,
        riskLevel,
        summary: `${riskLevel} risk summary`,
      });

      const approval = await approvalService.createFromAIAnalysis(event.id);
      // 实现返回 null 占位（cast 为 Approval），因此可能 falsy
      expect(approval).toBeFalsy();

      const persisted = await prisma.approval.findFirst({ where: { eventId: event.id } });
      expect(persisted).toBeNull();
    },
  );
});
