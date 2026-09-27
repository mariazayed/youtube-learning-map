import {
  BadRequestException,
  ConflictException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { VideoAnalysis } from '@learnmap/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { AnalysisQueueService } from '../queue/analysis-queue.service';
import type { YoutubeService } from '../youtube/youtube.service';
import {
  DailyAnalysisLimitExceededError,
  type AnalysesRepository,
} from './analyses.repository';
import { AnalysesService, createAnalysisCacheKey } from './analyses.service';

const USER: AuthenticatedUser = { id: 'client_12345678', mode: 'anonymous' };
const ID = 'cm12345678901234567890123';
const VIDEO_ID = 'dQw4w9WgXcQ';

function row(overrides: Partial<VideoAnalysis> = {}): VideoAnalysis {
  return {
    id: ID,
    userId: USER.id,
    youtubeVideoId: VIDEO_ID,
    youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    videoTitle: 'Lesson',
    channelTitle: 'Teacher',
    thumbnailUrl: 'https://i.ytimg.com/vi/example/hqdefault.jpg',
    durationSeconds: 600,
    outputLanguage: 'EN',
    detectedLanguage: null,
    status: 'QUEUED',
    progress: 0,
    summary: null,
    mindMap: null,
    provider: null,
    model: null,
    promptVersion: 1,
    schemaVersion: 2,
    cacheKey: 'cache-key',
    errorCode: null,
    errorMessage: null,
    attemptCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AnalysesService', () => {
  function repositoryMocks() {
    return {
      upsertUser: vi.fn<AnalysesRepository['upsertUser']>().mockResolvedValue(undefined),
      findByCacheKey: vi
        .fn<AnalysesRepository['findByCacheKey']>()
        .mockResolvedValue(null),
      createQueuedWithinDailyLimit: vi
        .fn<AnalysesRepository['createQueuedWithinDailyLimit']>()
        .mockResolvedValue({ analysis: row(), created: true }),
      listOwned: vi.fn<AnalysesRepository['listOwned']>().mockResolvedValue([]),
      findOwned: vi.fn<AnalysesRepository['findOwned']>().mockResolvedValue(row()),
      requeueFailed: vi
        .fn<AnalysesRepository['requeueFailed']>()
        .mockResolvedValue(row()),
      markQueueFailure: vi
        .fn<AnalysesRepository['markQueueFailure']>()
        .mockResolvedValue(undefined),
      deleteOwned: vi.fn<AnalysesRepository['deleteOwned']>().mockResolvedValue(true),
    };
  }

  let repository: ReturnType<typeof repositoryMocks>;
  let youtube: { getMetadata: ReturnType<typeof vi.fn> };
  let queue: { enqueue: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let service: AnalysesService;

  beforeEach(() => {
    repository = repositoryMocks();
    youtube = {
      getMetadata: vi.fn().mockResolvedValue({
        title: 'Lesson',
        channelTitle: 'Teacher',
        thumbnailUrl: 'https://i.ytimg.com/vi/example/hqdefault.jpg',
        durationSeconds: 600,
      }),
    };
    queue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      get: vi.fn(
        (key: string) =>
          ({
            ANALYSIS_PROMPT_VERSION: 1,
            ANALYSIS_SCHEMA_VERSION: 2,
            DAILY_ANALYSIS_LIMIT: 5,
          })[key],
      ),
    } as unknown as ConfigService;
    service = new AnalysesService(
      config,
      youtube as unknown as YoutubeService,
      queue as unknown as AnalysisQueueService,
      repository as unknown as AnalysesRepository,
    );
  });

  it('validates metadata, creates a queued record, and enqueues by analysis ID', async () => {
    await expect(
      service.create(USER, {
        youtubeUrl: `https://youtu.be/${VIDEO_ID}`,
        outputLanguage: 'en',
      }),
    ).resolves.toEqual({ id: ID, status: 'QUEUED' });

    expect(repository.upsertUser).toHaveBeenCalledWith(USER);
    expect(youtube.getMetadata).toHaveBeenCalledWith(VIDEO_ID);
    const createArguments = repository.createQueuedWithinDailyLimit.mock.calls[0];
    expect(createArguments).toBeDefined();
    expect(createArguments?.[0]).toMatchObject({
      userId: USER.id,
      youtubeVideoId: VIDEO_ID,
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      outputLanguage: 'EN',
    });
    expect(createArguments?.[0].cacheKey).toMatch(/^[a-f0-9]{64}$/);
    expect(createArguments?.[1]).toBe(5);
    expect(createArguments?.[2]).toEqual(expect.any(Date));
    expect(queue.enqueue).toHaveBeenCalledWith(ID, `analysis-${ID}`, undefined);
  });

  it('reuses an existing record without creating or enqueuing it', async () => {
    repository.findByCacheKey.mockResolvedValue(row({ status: 'COMPLETED' }));
    await expect(
      service.create(USER, {
        youtubeUrl: `https://youtu.be/${VIDEO_ID}`,
        outputLanguage: 'en',
      }),
    ).resolves.toEqual({ id: ID, status: 'COMPLETED' });
    expect(repository.createQueuedWithinDailyLimit).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('marks the row failed and returns 503 if queueing fails', async () => {
    queue.enqueue.mockRejectedValue(new Error('Redis secret'));
    await expect(
      service.create(USER, {
        youtubeUrl: `https://youtu.be/${VIDEO_ID}`,
        outputLanguage: 'en',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.markQueueFailure).toHaveBeenCalledWith(USER.id, ID);
  });

  it('maps an atomically exhausted daily quota to HTTP 429', async () => {
    repository.createQueuedWithinDailyLimit.mockRejectedValue(
      new DailyAnalysisLimitExceededError(5),
    );
    await expect(
      service.create(USER, {
        youtubeUrl: `https://youtu.be/${VIDEO_ID}`,
        outputLanguage: 'en',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(youtube.getMetadata).toHaveBeenCalledWith(VIDEO_ID);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('does not expose another user’s failure details', async () => {
    repository.findOwned.mockResolvedValue(null);
    await expect(
      service.status({ id: 'different-user', mode: 'oidc' }, ID),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('scopes history to the authenticated user', async () => {
    repository.listOwned.mockResolvedValue([row()]);
    await expect(service.list(USER)).resolves.toHaveLength(1);
    expect(repository.listOwned).toHaveBeenCalledWith(USER.id);
  });

  it('hides foreign analyses on full-record reads', async () => {
    repository.findOwned.mockResolvedValue(null);
    await expect(service.get(USER, ID)).rejects.toMatchObject({ status: 404 });
  });

  it('cannot retry or delete a foreign analysis', async () => {
    repository.findOwned.mockResolvedValue(null);
    await expect(service.retry(USER, ID)).rejects.toMatchObject({ status: 404 });
    await expect(service.delete(USER, ID)).rejects.toMatchObject({ status: 404 });
    expect(repository.requeueFailed).not.toHaveBeenCalled();
    expect(repository.deleteOwned).not.toHaveBeenCalled();
  });

  it('returns ownership-scoped status data', async () => {
    repository.findOwned.mockResolvedValue(
      row({ status: 'FAILED', progress: 30, errorCode: 'MODEL_ERROR' }),
    );
    await expect(service.status(USER, ID)).resolves.toEqual({
      id: ID,
      status: 'FAILED',
      progress: 30,
      errorCode: 'MODEL_ERROR',
      errorMessage: null,
      completedAt: null,
    });
    expect(repository.findOwned).toHaveBeenCalledWith(USER.id, ID);
  });

  it('returns detected video language independently from output language', async () => {
    repository.findOwned.mockResolvedValue(
      row({ outputLanguage: 'EN', detectedLanguage: 'AR' }),
    );

    await expect(service.get(USER, ID)).resolves.toMatchObject({
      detectedLanguage: 'ar',
      outputLanguage: 'en',
    });
  });

  it('atomically retries a failed analysis', async () => {
    repository.findOwned.mockResolvedValue(row({ status: 'FAILED' }));
    repository.requeueFailed.mockResolvedValue(row({ status: 'QUEUED' }));
    await expect(service.retry(USER, ID)).resolves.toEqual({
      id: ID,
      status: 'QUEUED',
    });
    expect(queue.remove).toHaveBeenCalledTimes(3);
    expect(repository.requeueFailed).toHaveBeenCalledWith(USER.id, ID);
    expect(queue.enqueue).toHaveBeenCalledWith(ID, `analysis-${ID}`, undefined);
  });

  it('rejects retry when the state changed concurrently', async () => {
    repository.findOwned.mockResolvedValue(row({ status: 'FAILED' }));
    repository.requeueFailed.mockResolvedValue(null);
    await expect(service.retry(USER, ID)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not delete a processing analysis', async () => {
    repository.findOwned.mockResolvedValue(row({ status: 'PROCESSING' }));
    await expect(service.delete(USER, ID)).rejects.toBeInstanceOf(ConflictException);
    expect(repository.deleteOwned).not.toHaveBeenCalled();
  });

  it('rejects malformed YouTube URLs before metadata retrieval', async () => {
    await expect(
      service.create(USER, {
        youtubeUrl: 'https://example.com/not-youtube',
        outputLanguage: 'en',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(youtube.getMetadata).not.toHaveBeenCalled();
  });
});

describe('createAnalysisCacheKey', () => {
  const base = {
    videoId: VIDEO_ID,
    outputLanguage: 'en' as const,
    promptVersion: 3,
    schemaVersion: 3,
  };

  it('is deterministic and changes for every cache compatibility dimension', () => {
    const first = createAnalysisCacheKey(base);
    expect(first).toBe(createAnalysisCacheKey(base));
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(createAnalysisCacheKey({ ...base, videoId: 'aaaaaaaaaaa' })).not.toBe(first);
    expect(createAnalysisCacheKey({ ...base, outputLanguage: 'ar' })).not.toBe(first);
    expect(createAnalysisCacheKey({ ...base, promptVersion: 4 })).not.toBe(first);
    expect(createAnalysisCacheKey({ ...base, schemaVersion: 4 })).not.toBe(first);
  });
});
