import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import {
  ANALYSIS_JOB_ATTEMPTS,
  analysisJobDataSchema,
  validateVideoAnalysisResult,
  type AnalysisJobData,
  type VideoAnalysisResult,
} from '@learnmap/contracts';
import { createLogEvent, type StructuredLogFields } from '@learnmap/observability';
import { type Job, UnrecoverableError } from 'bullmq';
import { AnalysisRepository } from './analysis.repository';
import { asError, classifyFailure, ProcessingError } from './processing-error';
import { VideoAnalysisProvider } from './video-analysis-provider';
import {
  analysisOutcomes,
  analysisProcessingDuration,
  estimatedAnalysisCost,
  providerErrors,
  validationFailures,
} from './worker-metrics';
import { YoutubeMetadataService } from './youtube-metadata.service';

@Injectable()
export class AnalysisJobHandler {
  private readonly logger = new Logger(AnalysisJobHandler.name);
  private readonly model: string;
  private readonly estimatedCostPerMinute: number;

  constructor(
    config: ConfigService,
    private readonly repository: AnalysisRepository,
    private readonly youtube: YoutubeMetadataService,
    private readonly provider: VideoAnalysisProvider,
  ) {
    this.model = config.getOrThrow<string>('GEMINI_VIDEO_MODEL');
    this.estimatedCostPerMinute =
      config.get<number>('AI_ESTIMATED_COST_PER_VIDEO_MINUTE_USD') ?? 0;
  }

  async handle(job: Job<AnalysisJobData>): Promise<void> {
    const parsedData = analysisJobDataSchema.safeParse(job.data);
    if (!parsedData.success) throw new UnrecoverableError('Invalid analysis job.');
    const { analysisId, requestId } = parsedData.data;
    const startedAt = performance.now();
    const attemptNumber = job.attemptsMade + 1;
    let logContext: StructuredLogFields = {
      requestId,
      analysisId,
      provider: 'gemini',
      model: this.model,
      attemptNumber,
    };

    try {
      const analysis = await this.repository.findById(analysisId);
      if (!analysis || analysis.status === 'COMPLETED') return;
      logContext = {
        ...logContext,
        userId: analysis.userId,
        videoId: analysis.youtubeVideoId,
      };
      const claimed = await this.repository.beginAttempt(analysis.id, analysis.startedAt);
      if (!claimed) return;
      this.logger.log(
        createLogEvent('analysis_processing_started', {
          ...logContext,
          status: 'PROCESSING',
        }),
      );
      await job.updateProgress(10);

      const canonicalUrl = `https://www.youtube.com/watch?v=${analysis.youtubeVideoId}`;
      if (analysis.youtubeUrl !== canonicalUrl) {
        throw new ProcessingError('INVALID_VIDEO_URL', false);
      }
      const metadata = await this.youtube.verify(analysis.youtubeVideoId);
      await this.repository.refreshMetadata(analysis.id, metadata);
      await this.repository.setProgress(analysis.id, 25);
      await job.updateProgress(25);

      const providerResult = await this.provider.analyze({
        youtubeUrl: analysis.youtubeUrl,
        outputLanguage: analysis.outputLanguage === 'AR' ? 'ar' : 'en',
        title: metadata.title,
        durationSeconds: metadata.durationSeconds,
      });
      await this.repository.setProgress(analysis.id, 70);
      await job.updateProgress(70);
      const result = this.validateResult(providerResult, metadata.durationSeconds);
      await this.repository.setProgress(analysis.id, 85);
      await job.updateProgress(85);
      await this.repository.setProgress(analysis.id, 95);
      await job.updateProgress(95);
      await this.repository.complete(analysis.id, result, this.model);
      await job.updateProgress(100);

      const durationSeconds = (performance.now() - startedAt) / 1_000;
      analysisProcessingDuration.observe({ status: 'completed' }, durationSeconds);
      analysisOutcomes.inc({
        status: 'completed',
        provider: 'gemini',
        model: this.model,
        error_code: 'none',
      });
      estimatedAnalysisCost.observe(
        (metadata.durationSeconds / 60) * this.estimatedCostPerMinute,
      );
      this.logger.log(
        createLogEvent('analysis_processing_completed', {
          ...logContext,
          status: 'COMPLETED',
          durationMs: Math.round(durationSeconds * 100_000) / 100,
        }),
      );
    } catch (error) {
      await this.handleFailure(job, analysisId, error, startedAt, logContext);
    }
  }

  private async handleFailure(
    job: Job<AnalysisJobData>,
    analysisId: string,
    error: unknown,
    startedAt: number,
    logContext: StructuredLogFields,
  ): Promise<never> {
    const failure = classifyFailure(error);
    const attempts = Number(job.opts.attempts ?? ANALYSIS_JOB_ATTEMPTS);
    const finalAttempt = job.attemptsMade + 1 >= attempts;
    const terminal = !failure.retryable || finalAttempt;
    const durationSeconds = (performance.now() - startedAt) / 1_000;

    analysisProcessingDuration.observe(
      { status: terminal ? 'failed' : 'retrying' },
      durationSeconds,
    );
    if (
      failure.code.startsWith('PROVIDER_') ||
      failure.code === 'SAFETY_POLICY_REJECTION'
    ) {
      providerErrors.inc({
        provider: 'gemini',
        model: this.model,
        error_code: failure.code,
        retryable: String(failure.retryable),
      });
    }
    if (failure.code === 'INVALID_SCHEMA') validationFailures.inc();
    if (terminal) {
      analysisOutcomes.inc({
        status: 'failed',
        provider: 'gemini',
        model: this.model,
        error_code: failure.code,
      });
      Sentry.withScope((scope) => {
        scope.setTag('analysis_id', analysisId);
        scope.setTag('error_code', failure.code);
        scope.setTag('attempt_number', String(job.attemptsMade + 1));
        Sentry.captureException(error);
      });
    }
    this.logger.error(
      createLogEvent(
        terminal ? 'analysis_processing_failed' : 'analysis_processing_retrying',
        {
          ...logContext,
          status: terminal ? 'FAILED' : 'QUEUED',
          durationMs: Math.round(durationSeconds * 100_000) / 100,
          errorCode: failure.code,
        },
        'error',
      ),
    );

    try {
      if (terminal) {
        await this.repository.fail(analysisId, failure);
      } else {
        await this.repository.prepareRetry(analysisId);
      }
    } catch {
      // BullMQ remains the retry authority when failure-state persistence is unavailable.
    }
    if (!failure.retryable) throw new UnrecoverableError(failure.safeMessage);
    throw asError(error);
  }

  private validateResult(
    result: VideoAnalysisResult,
    durationSeconds: number,
  ): VideoAnalysisResult {
    try {
      return validateVideoAnalysisResult(result, { durationSeconds });
    } catch {
      throw new ProcessingError('INVALID_SCHEMA', true);
    }
  }
}
