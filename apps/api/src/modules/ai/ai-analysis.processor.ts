import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationChannel, prisma } from '@repo-pulse/database';
import { AIService } from './ai.service';
import { ApprovalService } from '../approval/approval.service';
import { NotificationService } from '../notification/notification.service';

interface AIAnalysisJob {
  eventId: string;
}

@Processor('ai-analysis')
export class AIProcessor extends WorkerHost {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(
    private readonly aiService: AIService,
    private readonly approvalService: ApprovalService,
    private readonly notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<AIAnalysisJob>): Promise<void> {
    const { eventId } = job.data;

    this.logger.log(`Processing AI analysis for event: ${eventId}`);

    try {
      const analysis = await this.aiService.analyzeEvent(eventId);
      this.logger.log(`AI analysis completed for event: ${eventId}`);

      const approval = await this.approvalService.createFromAIAnalysis(eventId);
      if (approval) {
        this.logger.log(`approval_created eventId=${eventId} approvalId=${approval.id}`);
        await this.notifyApprovalCreated(eventId, analysis.summary);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`ai_analysis_failed eventId=${eventId} reason=${err.message}`, err.stack);
      throw error;
    }
  }

  private async notifyApprovalCreated(eventId: string, summary: string): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        repository: {
          include: {
            users: true,
          },
        },
      },
    });

    if (!event) {
      return;
    }

    for (const userRepo of event.repository.users) {
      const prefs = await this.notificationService.getPreferences(userRepo.userId);
      if (!prefs.events.highRisk || !prefs.channels.includes(NotificationChannel.IN_APP)) {
        continue;
      }

      await this.notificationService.send({
        userId: userRepo.userId,
        eventId,
        channel: NotificationChannel.IN_APP,
        title: `Approval required: ${event.title}`,
        content: summary,
        metadata: {
          source: 'ai_approval_pipeline',
          riskLevel: 'HIGH_OR_CRITICAL',
        },
      });
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}
