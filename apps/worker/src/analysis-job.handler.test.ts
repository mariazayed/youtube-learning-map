import type { ConfigService } from '@nestjs/config';
import type { AnalysisJobData, VideoAnalysisResult } from '@learnmap/contracts';
import type { VideoAnalysis } from '@learnmap/database';
import { type Job, UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalysisJobHandler } from './analysis-job.handler';
import type { AnalysisRepository } from './analysis.repository';
import { ProcessingError } from './processing-error';
import type { VideoAnalysisProvider } from './video-analysis-provider';
import type { YoutubeMetadataService } from './youtube-metadata.service';

const ID = 'cm12345678901234567890123';
const VIDEO_ID = 'dQw4w9WgXcQ';
const metadata = {
  title: 'Current lesson title',
  channelTitle: 'Teacher',
  durationSeconds: 600,
};
const result: VideoAnalysisResult = {
  title: 'Lesson',
  detectedLanguage: 'en',
  summary: {
    overview: 'Overview',
    learningObjectives: [],
    mainIdeas: [],
    keyTakeaways: [],
    glossary: [],
  },
  mindMap: {
    nodes: [
      {
        id: 'root',
        parentId: null,
        title: 'Lesson',
        explanation: 'Overview',
        timestampSeconds: 0,
        type: 'root',
        directlySupported: true,
      },
    ],
  },
};

function analysis(overrides: Partial<VideoAnalysis> = {}): VideoAnalysis {
  return {
    id: ID,
    userId: 'client_123456789',
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

function repositoryMocks() {
  return {
    findById: vi.fn<AnalysisRepository['findById']>().mockResolvedValue(analysis()),
    beginAttempt: vi.fn<AnalysisRepository['beginAttempt']>().mockResolvedValue(true),
    refreshMetadata: vi
      .fn<AnalysisRepository['refreshMetadata']>()
      .mockResolvedValue(undefined),
    setProgress: vi.fn<AnalysisRepository['setProgress']>().mockResolvedValue(undefined),
    complete: vi.fn<AnalysisRepository['complete']>().mockResolvedValue(undefined),
    prepareRetry: vi
      .fn<AnalysisRepository['prepareRetry']>()
      .mockResolvedValue(undefined),
    fail: vi.fn<AnalysisRepository['fail']>().mockResolvedValue(undefined),
  };
}

describe('AnalysisJobHandler', () => {
  let repository: ReturnType<typeof repositoryMocks>;
  let youtube: { verify: ReturnType<typeof vi.fn<YoutubeMetadataService['verify']>> };
  let provider: {
    analyze: ReturnType<typeof vi.fn<VideoAnalysisProvider['analyze']>>;
  };
  let updateProgress: ReturnType<typeof vi.fn>;
  let handler: AnalysisJobHandler;

  function job(attemptsMade = 0, attempts = 3): Job<AnalysisJobData> {
    return {
      data: { analysisId: ID },
      attemptsMade,
      opts: { attempts },
      updateProgress,
    } as unknown as Job<AnalysisJobData>;
  }

  beforeEach(() => {
    repository = repositoryMocks();
    youtube = { verify: vi.fn().mockResolvedValue(metadata) };
    provider = { analyze: vi.fn().mockResolvedValue(result) };
    updateProgress = vi.fn().mockResolvedValue(undefined);
    const config = {
      getOrThrow: vi.fn().mockReturnValue('gemini-test-model'),
      get: vi.fn().mockReturnValue(0),
    } as unknown as ConfigService;
    handler = new AnalysisJobHandler(
      config,
      repository,
      youtube as unknown as YoutubeMetadataService,
      provider,
    );
  });

  it('runs the full sequence and persists only validated output', async () => {
    await handler.handle(job());
    expect(repository.findById).toHaveBeenCalledWith(ID);
    expect(repository.beginAttempt).toHaveBeenCalledWith(ID, null);
    expect(youtube.verify).toHaveBeenCalledWith(VIDEO_ID);
    expect(repository.refreshMetadata).toHaveBeenCalledWith(ID, metadata);
    expect(repository.setProgress.mock.calls).toEqual([
      [ID, 25],
      [ID, 70],
      [ID, 85],
      [ID, 95],
    ]);
    expect(repository.complete).toHaveBeenCalledWith(ID, result, 'gemini-test-model');
    expect(updateProgress).toHaveBeenNthCalledWith(1, 10);
    expect(updateProgress).toHaveBeenNthCalledWith(2, 25);
    expect(updateProgress).toHaveBeenNthCalledWith(3, 70);
    expect(updateProgress).toHaveBeenNthCalledWith(4, 85);
    expect(updateProgress).toHaveBeenNthCalledWith(5, 95);
    expect(updateProgress).toHaveBeenNthCalledWith(6, 100);
  });

  it('exits idempotently when already completed', async () => {
    repository.findById.mockResolvedValue(analysis({ status: 'COMPLETED' }));
    await handler.handle(job());
    expect(repository.beginAttempt).not.toHaveBeenCalled();
  });

  it('exits when another worker already claimed a duplicate job', async () => {
    repository.beginAttempt.mockResolvedValue(false);
    await handler.handle(job());
    expect(youtube.verify).not.toHaveBeenCalled();
    expect(provider.analyze).not.toHaveBeenCalled();
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it('recovers an interrupted processing analysis after worker restart', async () => {
    const startedAt = new Date('2026-01-01T00:00:00.000Z');
    repository.findById.mockResolvedValue(
      analysis({ status: 'PROCESSING', progress: 25, startedAt }),
    );
    await handler.handle(job(1));
    expect(repository.beginAttempt).toHaveBeenCalledWith(ID, startedAt);
    expect(repository.complete).toHaveBeenCalledWith(ID, result, 'gemini-test-model');
  });

  it('returns transient failures to queued state for retry', async () => {
    provider.analyze.mockRejectedValue(new ProcessingError('PROVIDER_RATE_LIMIT', true));
    await expect(handler.handle(job())).rejects.toBeInstanceOf(ProcessingError);
    expect(repository.prepareRetry).toHaveBeenCalledWith(ID);
    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('marks a transient failure failed only on the final attempt', async () => {
    provider.analyze.mockRejectedValue(
      new ProcessingError('PROVIDER_TEMPORARILY_UNAVAILABLE', true),
    );
    await expect(handler.handle(job(2))).rejects.toBeInstanceOf(ProcessingError);
    expect(repository.fail).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ code: 'PROVIDER_TEMPORARILY_UNAVAILABLE' }),
    );
  });

  it('stops retries for permanent errors', async () => {
    youtube.verify.mockRejectedValue(new ProcessingError('VIDEO_NOT_PUBLIC', false));
    await expect(handler.handle(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(repository.fail).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ code: 'VIDEO_NOT_PUBLIC', retryable: false }),
    );
  });

  it('never sends a non-canonical URL to the provider', async () => {
    repository.findById.mockResolvedValue(
      analysis({ youtubeUrl: 'https://attacker.example/video' }),
    );
    await expect(handler.handle(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('retries an invalid provider result without partial persistence', async () => {
    provider.analyze.mockResolvedValue({ title: 'invalid' } as VideoAnalysisResult);
    await expect(handler.handle(job())).rejects.toBeInstanceOf(ProcessingError);
    expect(repository.complete).not.toHaveBeenCalled();
    expect(repository.prepareRetry).toHaveBeenCalledWith(ID);
  });

  it('sanitizes unexpected infrastructure errors', async () => {
    repository.findById.mockRejectedValue(
      new Error('postgresql://user:secret@private-host/database'),
    );
    try {
      await handler.handle(job());
      throw new Error('Expected processing to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ProcessingError);
      expect((error as Error).message).not.toContain('secret');
    }
  });
});
