import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ANALYSIS_JOB_NAME,
  ANALYSIS_JOB_OPTIONS,
  ANALYSIS_QUEUE_NAME,
  analysisJobDataSchema,
} from '@learnmap/contracts';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { WORKER_HEARTBEAT_KEY } from '@learnmap/observability';

export type QueueTelemetry = {
  jobs: Record<'active' | 'delayed' | 'failed' | 'waiting', number>;
  workerAvailable: boolean;
};

@Injectable()
export class AnalysisQueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue<{ analysisId: string }>;

  constructor(config: ConfigService) {
    this.connection = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    this.queue = new Queue(ANALYSIS_QUEUE_NAME, { connection: this.connection });
  }

  async enqueue(analysisId: string, jobId: string, requestId?: string): Promise<void> {
    const data = analysisJobDataSchema.parse({ analysisId, requestId });
    await this.queue.add(ANALYSIS_JOB_NAME, data, {
      jobId,
      ...ANALYSIS_JOB_OPTIONS,
    });
  }

  async ping(): Promise<void> {
    await this.connection.ping();
  }

  async remove(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove();
  }

  async telemetry(): Promise<QueueTelemetry> {
    const [counts, heartbeat] = await Promise.all([
      this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      this.connection.get(WORKER_HEARTBEAT_KEY),
    ]);
    return {
      jobs: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
      },
      workerAvailable: heartbeat !== null,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
