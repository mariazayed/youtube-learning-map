import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  analysisAcceptedSchema,
  analysisJobId,
  analysisSchema,
  analysisStatusResponseSchema,
  type Analysis,
  type AnalysisAccepted,
  type AnalysisStatusResponse,
  videoAnalysisResultSchema,
} from '@learnmap/contracts';
import type { VideoAnalysis } from '@learnmap/database';
import { createLogEvent } from '@learnmap/observability';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AnalysisQueueService } from '../queue/analysis-queue.service';
import {
  canonicalYouTubeUrl,
  extractYouTubeVideoId,
  InvalidYouTubeUrlError,
} from '../youtube/youtube-url';
import { YoutubeService } from '../youtube/youtube.service';
import {
  AnalysesRepository,
  DailyAnalysisLimitExceededError,
} from './analyses.repository';
import type { CreateAnalysisDto } from './dto/create-analysis.dto';
import { analysesCreated, analysisCacheHits } from '../observability/api-metrics';

export function createAnalysisCacheKey(input: {
  videoId: string;
  outputLanguage: 'ar' | 'en';
  promptVersion: number;
  schemaVersion: number;
}): string {
  return createHash('sha256')
    .update(
      [
        input.videoId,
        input.outputLanguage,
        input.promptVersion,
        input.schemaVersion,
      ].join(':'),
    )
    .digest('hex');
}

@Injectable()
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly youtube: YoutubeService,
    private readonly queue: AnalysisQueueService,
    private readonly repository: AnalysesRepository,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateAnalysisDto,
    requestId?: string,
  ): Promise<AnalysisAccepted> {
    await this.repository.upsertUser(user);
    const videoId = this.parseVideoId(dto.youtubeUrl);
    const metadata = await this.youtube.getMetadata(videoId);
    const promptVersion = this.config.get<number>('ANALYSIS_PROMPT_VERSION') ?? 1;
    const schemaVersion = this.config.get<number>('ANALYSIS_SCHEMA_VERSION') ?? 1;
    const cacheKey = createAnalysisCacheKey({
      videoId,
      outputLanguage: dto.outputLanguage,
      promptVersion,
      schemaVersion,
    });

    const existing = await this.repository.findByCacheKey(user.id, cacheKey);
    if (existing) {
      analysisCacheHits.inc();
      this.logger.log(
        createLogEvent('analysis_cache_hit', {
          requestId,
          analysisId: existing.id,
          userId: user.id,
          videoId,
          status: existing.status,
        }),
      );
      return this.toAccepted(existing);
    }

    const dailyLimit = this.config.get<number>('DAILY_ANALYSIS_LIMIT') ?? 5;
    const usageDate = new Date();
    usageDate.setUTCHours(0, 0, 0, 0);
    let queued: { analysis: VideoAnalysis; created: boolean };
    try {
      queued = await this.repository.createQueuedWithinDailyLimit(
        {
          userId: user.id,
          youtubeVideoId: videoId,
          youtubeUrl: canonicalYouTubeUrl(videoId),
          videoTitle: metadata.title,
          channelTitle: metadata.channelTitle,
          thumbnailUrl: metadata.thumbnailUrl,
          durationSeconds: metadata.durationSeconds,
          outputLanguage: dto.outputLanguage === 'ar' ? 'AR' : 'EN',
          promptVersion,
          schemaVersion,
          cacheKey,
        },
        dailyLimit,
        usageDate,
      );
    } catch (error) {
      if (error instanceof DailyAnalysisLimitExceededError) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }

    const { analysis, created } = queued;

    if (created) {
      analysesCreated.inc({ output_language: dto.outputLanguage });
      await this.enqueueOrFail(user.id, analysis, analysisJobId(analysis.id), requestId);
      this.logger.log(
        createLogEvent('analysis_queued', {
          requestId,
          analysisId: analysis.id,
          userId: user.id,
          videoId,
          status: 'QUEUED',
        }),
      );
    }
    return this.toAccepted(analysis);
  }

  async list(user: AuthenticatedUser): Promise<Analysis[]> {
    const rows = await this.repository.listOwned(user.id);
    return rows.map((row) => this.toContract(row));
  }

  async get(user: AuthenticatedUser, id: string): Promise<Analysis> {
    return this.toContract(await this.getOwned(user.id, id));
  }

  async status(user: AuthenticatedUser, id: string): Promise<AnalysisStatusResponse> {
    const row = await this.getOwned(user.id, id);
    return analysisStatusResponseSchema.parse({
      id: row.id,
      status: row.status,
      progress: row.progress,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      completedAt: row.completedAt?.toISOString() ?? null,
    });
  }

  async retry(
    user: AuthenticatedUser,
    id: string,
    requestId?: string,
  ): Promise<AnalysisAccepted> {
    const existing = await this.getOwned(user.id, id);
    if (existing.status !== 'FAILED') {
      throw new BadRequestException('Only failed analyses can be retried.');
    }
    await this.removeQueuedJobs(existing);
    const updated = await this.repository.requeueFailed(user.id, id);
    if (!updated) {
      throw new ConflictException('The analysis state changed. Refresh and try again.');
    }
    await this.enqueueOrFail(user.id, updated, analysisJobId(updated.id), requestId);
    return this.toAccepted(updated);
  }

  async delete(user: AuthenticatedUser, id: string): Promise<void> {
    const existing = await this.getOwned(user.id, id);
    if (existing.status === 'PROCESSING') {
      throw new ConflictException('A processing analysis cannot be deleted.');
    }
    if (existing.status === 'QUEUED') await this.removeQueuedJobs(existing);
    const deleted = await this.repository.deleteOwned(user.id, id);
    if (!deleted) throw new NotFoundException('Analysis not found.');
  }

  private parseVideoId(url: string): string {
    try {
      return extractYouTubeVideoId(url);
    } catch (error) {
      if (error instanceof InvalidYouTubeUrlError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async enqueueOrFail(
    userId: string,
    analysis: VideoAnalysis,
    jobId: string,
    requestId?: string,
  ): Promise<void> {
    try {
      await this.queue.enqueue(analysis.id, jobId, requestId);
    } catch {
      await this.repository.markQueueFailure(userId, analysis.id).catch(() => undefined);
      throw new ServiceUnavailableException(
        'Analysis could not be queued. Please retry later.',
      );
    }
  }

  private async removeQueuedJobs(analysis: VideoAnalysis): Promise<void> {
    try {
      await Promise.all(
        [...new Set([analysisJobId(analysis.id), analysis.id, analysis.cacheKey])].map(
          (jobId) => this.queue.remove(jobId),
        ),
      );
    } catch {
      throw new ServiceUnavailableException(
        'The analysis queue is unavailable. Please retry later.',
      );
    }
  }

  private async getOwned(userId: string, id: string): Promise<VideoAnalysis> {
    const row = await this.repository.findOwned(userId, id);
    if (!row) throw new NotFoundException('Analysis not found.');
    return row;
  }

  private toAccepted(row: VideoAnalysis): AnalysisAccepted {
    return analysisAcceptedSchema.parse({ id: row.id, status: row.status });
  }

  private toContract(row: VideoAnalysis): Analysis {
    const summaryResult = videoAnalysisResultSchema.shape.summary.safeParse(row.summary);
    const mindMapResult = videoAnalysisResultSchema.shape.mindMap.safeParse(row.mindMap);
    const storedLanguage = row.detectedLanguage;
    const detectedLanguage = storedLanguage
      ? ({ AR: 'ar', EN: 'en', OTHER: 'other' } as const)[storedLanguage]
      : null;
    return analysisSchema.parse({
      id: row.id,
      youtubeVideoId: row.youtubeVideoId,
      youtubeUrl: row.youtubeUrl,
      videoTitle: row.videoTitle,
      channelTitle: row.channelTitle,
      thumbnailUrl: row.thumbnailUrl,
      durationSeconds: row.durationSeconds,
      outputLanguage: row.outputLanguage === 'AR' ? 'ar' : 'en',
      detectedLanguage,
      status: row.status,
      progress: row.progress,
      summary: summaryResult.success ? summaryResult.data : null,
      mindMap: mindMapResult.success ? mindMapResult.data : null,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    });
  }
}
