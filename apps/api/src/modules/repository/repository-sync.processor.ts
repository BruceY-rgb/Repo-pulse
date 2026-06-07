import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, RepositorySyncStage } from '@repo-pulse/shared';
import { RepositoryService } from './repository.service';
import { EventGateway } from '../event/event.gateway';

export interface RepositorySyncJob {
  repositoryId: string;
  userId: string;
  silent?: boolean;
}

const STAGE_PROGRESS: Record<Exclude<RepositorySyncStage, 'done'>, number> = {
  commits: 5,
  prs: 40,
  releases: 65,
  issues: 80,
};

@Processor(QUEUE_NAMES.REPOSITORY_SYNC)
export class RepositorySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(RepositorySyncProcessor.name);

  constructor(
    private readonly repositoryService: RepositoryService,
    private readonly eventGateway: EventGateway,
  ) {
    super();
  }

  async process(job: Job<RepositorySyncJob>): Promise<void> {
    const { repositoryId, userId, silent } = job.data;
    const jobId = String(job.id ?? '');
    const startedAt = Date.now();

    this.logger.log(
      `repository_sync_started repositoryId=${repositoryId} userId=${userId} jobId=${jobId}`,
    );

    try {
      await this.repositoryService.sync(repositoryId, {
        onStageStart: (stage) => {
          this.eventGateway.broadcastRepositorySyncProgress({
            repositoryId,
            jobId,
            progress: STAGE_PROGRESS[stage],
            stage,
          });
        },
        ...(silent ? { eventPostCreate: { notify: false, analyze: false } } : {}),
      });

      const durationMs = Date.now() - startedAt;
      this.eventGateway.broadcastRepositorySyncProgress({
        repositoryId,
        jobId,
        progress: 100,
        stage: 'done',
      });
      this.eventGateway.broadcastRepositorySynced({
        repositoryId,
        jobId,
        durationMs,
        syncedAt: new Date().toISOString(),
      });
      this.logger.log(
        `repository_sync_done repositoryId=${repositoryId} jobId=${jobId} durationMs=${durationMs}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.eventGateway.broadcastRepositorySyncFailed({
        repositoryId,
        jobId,
        reason,
        failedAt: new Date().toISOString(),
      });
      this.logger.error(
        `repository_sync_failed repositoryId=${repositoryId} jobId=${jobId} reason=${reason}`,
      );
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(`repository_sync_completed jobId=${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `repository_sync_job_failed jobId=${job.id} reason=${err.message}`,
    );
  }
}
