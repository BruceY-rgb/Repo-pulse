import { forwardRef, Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationChannel, prisma } from '@repo-pulse/database';
import { AIService } from './ai.service';
import { ApprovalService } from '../approval/approval.service';
import { NotificationService } from '../notification/notification.service';
import { EventService } from '../event/event.service';
import { EventGateway } from '../event/event.gateway';
import { readBooleanEnv } from '../../common/utils/env-flags';

interface AIAnalysisJob {
  eventId: string;
  force?: boolean;
  source?: 'auto' | 'manual';
}

@Processor('ai-analysis')
export class AIProcessor extends WorkerHost {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(
    private readonly aiService: AIService,
    private readonly approvalService: ApprovalService,
    private readonly notificationService: NotificationService,
    @Inject(forwardRef(() => EventService))
    private readonly eventService: EventService,
    private readonly eventGateway: EventGateway,
  ) {
    super();
  }

  async process(job: Job<AIAnalysisJob>): Promise<void> {
    const { eventId, force } = job.data;
    const source = job.data.source ?? (force ? 'manual' : 'auto');

    this.logger.log(`Processing AI analysis for event: ${eventId}, force=${force ?? false}, source=${source}`);

    if (!readBooleanEnv('AI_ANALYSIS_ENABLED', true)) {
      this.logger.log(`Skipping AI analysis job for event: ${eventId}, reason=system_disabled`);
      return;
    }

    if (source === 'auto' && !readBooleanEnv('AI_AUTO_ANALYSIS_ENABLED', false)) {
      this.logger.log(`Skipping AI analysis job for event: ${eventId}, reason=auto_disabled`);
      return;
    }

    // 在真正分析前取一次 repositoryId，供 started/completed/failed 三处复用。
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { repositoryId: true },
    });
    const repositoryId = event?.repositoryId ?? null;
    if (!repositoryId) {
      this.logger.warn(`broadcast_skipped_event_missing eventId=${eventId}`);
    }

    if (repositoryId) {
      this.eventGateway.broadcastAnalysisStarted({
        eventId,
        repositoryId,
        startedAt: new Date().toISOString(),
        source,
      });
    }

    try {
      const analysis = await this.aiService.analyzeEvent(eventId, force ?? false);
      this.logger.log(`AI analysis completed for event: ${eventId}`);

      // 分析完成后重试因等待 riskLevel 而延迟的通知
      await this.eventService.retryNotificationsAfterAnalysis(eventId);

      // 通知关注该仓库且有"分析完成"偏好的用户
      await this.notifyAnalysisCompleted(eventId, analysis.summary);

      const approval = await this.approvalService.createFromAIAnalysis(eventId);
      if (approval) {
        this.logger.log(`approval_created eventId=${eventId} approvalId=${approval.id}`);
        await this.notifyApprovalCreated(eventId, analysis.summary);
      }

      // 所有流程完成后通知前端刷新
      if (repositoryId) {
        this.eventGateway.broadcastAnalysisCompleted({
          eventId,
          repositoryId,
          completedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`ai_analysis_failed eventId=${eventId} reason=${err.message}`, err.stack);
      if (repositoryId) {
        this.eventGateway.broadcastAnalysisFailed({
          eventId,
          repositoryId,
          failedAt: new Date().toISOString(),
          reason: err.message,
        });
      }
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

  /**
   * 通知关注仓库且有"分析完成"偏好的用户
   */
  private async notifyAnalysisCompleted(eventId: string, summary: string): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        repository: {
          include: {
            users: {
              include: {
                user: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!event) return;

    for (const userRepo of event.repository.users) {
      try {
        const prefs = await this.notificationService.getPreferences(userRepo.userId);
        if (!prefs.events.analysisComplete) continue;
        if (!prefs.channels.includes(NotificationChannel.IN_APP)) continue;

        await this.notificationService.send({
          userId: userRepo.userId,
          eventId,
          channel: NotificationChannel.IN_APP,
          title: `Analysis complete: ${event.title}`,
          content: summary,
          metadata: {
            source: 'ai_analysis_complete',
            eventType: event.type,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(`notify_analysis_complete_failed eventId=${eventId} userId=${userRepo.userId} reason=${message}`);
      }
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
