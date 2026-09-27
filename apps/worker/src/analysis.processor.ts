import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import {
  ANALYSIS_JOB_ATTEMPTS,
  ANALYSIS_QUEUE_NAME,
  type AnalysisJobData,
} from '@learnmap/contracts';
import { UnrecoverableError, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createLogEvent, WORKER_HEARTBEAT_KEY } from '@learnmap/observability';
import { AnalysisJobHandler } from './analysis-job.handler';
import { AnalysisRepository } from './analysis.repository';
import { classifyFailure } from './processing-error';
import { workerHeartbeatTimestamp } from './worker-metrics';

@Injectable()
export class AnalysisProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisProcessor.name);
  private readonly connection: IORedis;
  private readonly concurrency: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTtlSeconds: number;
  private worker: Worker<AnalysisJobData> | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(
    config: ConfigService,
    private readonly handler: AnalysisJobHandler,
    private readonly repository: AnalysisRepository,
  ) {
    this.connection = new IORedis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.concurrency = config.get<number>('WORKER_CONCURRENCY') ?? 2;
    this.heartbeatIntervalMs =
      config.get<number>('WORKER_HEARTBEAT_INTERVAL_MS') ?? 15_000;
    this.heartbeatTtlSeconds = config.get<number>('WORKER_HEARTBEAT_TTL_SECONDS') ?? 45;
  }

  onModuleInit(): void {
    this.worker = new Worker(ANALYSIS_QUEUE_NAME, (job) => this.handler.handle(job), {
      connection: this.connection,
      concurrency: this.concurrency,
    });
    this.worker.on('completed', (job) => {
      this.logger.log(
        createLogEvent('analysis_job_completed', {
          requestId: job.data.requestId,
          analysisId: job.data.analysisId,
          jobId: job.id,
          status: 'COMPLETED',
          attemptNumber: job.attemptsMade + 1,
        }),
      );
    });
    this.worker.on('failed', (job, error) => {
      const attempts = Number(job?.opts.attempts ?? ANALYSIS_JOB_ATTEMPTS);
      const terminal =
        error instanceof UnrecoverableError || (job?.attemptsMade ?? 0) >= attempts;
      this.logger.error(
        createLogEvent(
          'analysis_job_failed',
          {
            requestId: job?.data.requestId,
            analysisId: job?.data.analysisId,
            jobId: job?.id ?? 'unknown',
            status: terminal ? 'FAILED' : 'RETRYING',
            attemptNumber: job ? job.attemptsMade + 1 : undefined,
            terminal,
          },
          'error',
        ),
      );
      if (terminal && job?.data.analysisId) {
        const failure = classifyFailure(error);
        void this.repository.fail(job.data.analysisId, failure).catch(() => {
          this.logger.error(
            createLogEvent(
              'analysis_failure_persistence_failed',
              { analysisId: job.data.analysisId, jobId: job.id, status: 'FAILED' },
              'error',
            ),
          );
        });
      }
    });
    this.worker.on('error', () => {
      Sentry.captureException(new Error('BullMQ worker emitted an error'));
      this.logger.error(
        createLogEvent(
          'analysis_worker_error',
          { status: 'UNAVAILABLE', errorCode: 'WORKER_ERROR' },
          'error',
        ),
      );
    });
    void this.writeHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.writeHeartbeat();
    }, this.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
    this.logger.log(
      createLogEvent('analysis_worker_started', {
        queue: ANALYSIS_QUEUE_NAME,
        concurrency: this.concurrency,
        status: 'READY',
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.worker?.close();
    await this.connection.quit();
  }

  private async writeHeartbeat(): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1_000);
      await this.connection.set(
        WORKER_HEARTBEAT_KEY,
        String(now),
        'EX',
        this.heartbeatTtlSeconds,
      );
      workerHeartbeatTimestamp.set(now);
    } catch {
      Sentry.captureException(new Error('Worker Redis heartbeat failed'));
      this.logger.error(
        createLogEvent(
          'worker_heartbeat_failed',
          { status: 'UNAVAILABLE', errorCode: 'REDIS_HEARTBEAT_FAILED' },
          'error',
        ),
      );
    }
  }
}
