import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AIService } from './ai.service';

interface AIAnalysisJob {
  eventId: string;
}

@Processor('ai-analysis')
export class AIProcessor extends WorkerHost {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(private readonly aiService: AIService) {
    super();
  }

  async process(job: Job<AIAnalysisJob>): Promise<void> {
    const { eventId } = job.data;

    this.logger.log(`Processing AI analysis for event: ${eventId}`);

    try {
      await this.aiService.analyzeEvent(eventId);
      this.logger.log(`AI analysis completed for event: ${eventId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`AI analysis failed for event: ${eventId}`, err.stack);
      throw error;
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
