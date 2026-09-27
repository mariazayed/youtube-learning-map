import 'reflect-metadata';
/* eslint-disable @typescript-eslint/require-await -- The in-memory adapter preserves the production async contract. */
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Supertest intentionally exposes decoded response bodies as any. */
import {
  BadRequestException,
  type INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { VideoAnalysis } from '@learnmap/database';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { RequestWithContext } from '../common/http-request';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { requestIdMiddleware } from '../common/validation/request-id';
import { AnalysisQueueService } from '../queue/analysis-queue.service';
import { YoutubeService } from '../youtube/youtube.service';
import { AnalysesController } from './analyses.controller';
import {
  AnalysesRepository,
  type CreateQueuedAnalysis,
  DailyAnalysisLimitExceededError,
} from './analyses.repository';
import { AnalysesService } from './analyses.service';

const VIDEO_ID = 'dQw4w9WgXcQ';
const LONG_VIDEO_ID = 'aaaaaaaaaaa';
const USER_ONE = 'integration-user-one';
const USER_TWO = 'integration-user-two';

class InMemoryAnalysesRepository {
  readonly rows = new Map<string, VideoAnalysis>();
  private readonly dailyUsage = new Map<string, number>();
  private sequence = 0;

  async upsertUser(user: AuthenticatedUser): Promise<void> {
    void user;
  }

  async findByCacheKey(userId: string, cacheKey: string): Promise<VideoAnalysis | null> {
    return (
      [...this.rows.values()].find(
        (row) => row.userId === userId && row.cacheKey === cacheKey,
      ) ?? null
    );
  }

  async createQueuedWithinDailyLimit(
    data: CreateQueuedAnalysis,
    dailyLimit: number,
  ): Promise<{ analysis: VideoAnalysis; created: boolean }> {
    const existing = await this.findByCacheKey(data.userId, data.cacheKey);
    if (existing) return { analysis: existing, created: false };
    const used = this.dailyUsage.get(data.userId) ?? 0;
    if (used >= dailyLimit) throw new DailyAnalysisLimitExceededError(dailyLimit);
    this.dailyUsage.set(data.userId, used + 1);
    this.sequence += 1;
    const now = new Date('2026-09-05T00:00:00.000Z');
    const analysis: VideoAnalysis = {
      ...data,
      id: `cm${String(this.sequence).padStart(23, '0')}`,
      detectedLanguage: null,
      status: 'QUEUED',
      progress: 0,
      summary: null,
      mindMap: null,
      provider: null,
      model: null,
      errorCode: null,
      errorMessage: null,
      attemptCount: 0,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    };
    this.rows.set(analysis.id, analysis);
    return { analysis, created: true };
  }

  async listOwned(userId: string): Promise<VideoAnalysis[]> {
    return [...this.rows.values()].filter((row) => row.userId === userId);
  }

  async findOwned(userId: string, id: string): Promise<VideoAnalysis | null> {
    const row = this.rows.get(id);
    return row?.userId === userId ? row : null;
  }

  async requeueFailed(userId: string, id: string): Promise<VideoAnalysis | null> {
    const row = await this.findOwned(userId, id);
    if (!row || row.status !== 'FAILED') return null;
    const updated = { ...row, status: 'QUEUED' as const, progress: 0 };
    this.rows.set(id, updated);
    return updated;
  }

  async markQueueFailure(userId: string, id: string): Promise<void> {
    const row = await this.findOwned(userId, id);
    if (row) this.rows.set(id, { ...row, status: 'FAILED' });
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const row = await this.findOwned(userId, id);
    return row ? this.rows.delete(id) : false;
  }

  markFailed(id: string): void {
    const row = this.rows.get(id);
    if (row) {
      this.rows.set(id, {
        ...row,
        status: 'FAILED',
        errorCode: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
        errorMessage: 'The video could not be analyzed. Please retry later.',
      });
    }
  }
}

describe('Analyses HTTP integration', () => {
  let app: INestApplication;
  let repository: InMemoryAnalysesRepository;
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    repository = new InMemoryAnalysesRepository();
    enqueue.mockClear();
    remove.mockClear();
    const youtube = {
      getMetadata: vi.fn(async (videoId: string) => {
        if (videoId === LONG_VIDEO_ID) {
          throw new BadRequestException('The video cannot be longer than 90 minutes.');
        }
        return {
          title: 'Integration lesson',
          channelTitle: 'Test teacher',
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationSeconds: 600,
        };
      }),
    };
    Reflect.defineMetadata('design:paramtypes', [AnalysesService], AnalysesController);
    Reflect.defineMetadata(
      'design:paramtypes',
      [ConfigService, YoutubeService, AnalysisQueueService, AnalysesRepository],
      AnalysesService,
    );
    const module = await Test.createTestingModule({
      controllers: [AnalysesController],
      providers: [
        AnalysesService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                ANALYSIS_PROMPT_VERSION: 3,
                ANALYSIS_SCHEMA_VERSION: 3,
                DAILY_ANALYSIS_LIMIT: 1,
              })[key],
          },
        },
        { provide: YoutubeService, useValue: youtube },
        { provide: AnalysisQueueService, useValue: { enqueue, remove } },
        { provide: AnalysesRepository, useValue: repository },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.use(requestIdMiddleware);
    app.use((rawRequest: Request, _response: Response, next: NextFunction) => {
      const current = rawRequest as RequestWithContext;
      current.user = {
        id: rawRequest.header('X-Test-User') ?? USER_ONE,
        mode: 'oidc',
      };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => app.close());

  const create = (videoId = VIDEO_ID, userId = USER_ONE) =>
    request(app.getHttpServer())
      .post('/v1/analyses')
      .set('X-Test-User', userId)
      .send({
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        outputLanguage: 'en',
      });

  it('creates a valid analysis and queues it once', async () => {
    const response = await create().expect(202);
    expect(response.body).toMatchObject({ status: 'QUEUED' });
    expect(enqueue).toHaveBeenCalledWith(
      response.body.id,
      `analysis-${response.body.id}`,
      expect.any(String),
    );
  });

  it('rejects invalid domains and overlong videos', async () => {
    await request(app.getHttpServer())
      .post('/v1/analyses')
      .set('X-Test-User', USER_ONE)
      .send({
        youtubeUrl: 'https://attacker.example/watch?v=dQw4w9WgXcQ',
        outputLanguage: 'en',
      })
      .expect(400);
    await create(LONG_VIDEO_ID).expect(400);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('returns the cached record without duplicate queue work or quota use', async () => {
    const first = await create().expect(202);
    const second = await create().expect(202);
    expect(second.body).toEqual(first.body);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('hides another user’s result', async () => {
    const created = await create().expect(202);
    await request(app.getHttpServer())
      .get(`/v1/analyses/${created.body.id}`)
      .set('X-Test-User', USER_TWO)
      .expect(404);
  });

  it('retries an owned failed analysis', async () => {
    const created = await create().expect(202);
    repository.markFailed(created.body.id);
    const response = await request(app.getHttpServer())
      .post(`/v1/analyses/${created.body.id}/retry`)
      .set('X-Test-User', USER_ONE)
      .expect(202);
    expect(response.body).toEqual({ id: created.body.id, status: 'QUEUED' });
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('enforces the persistent daily quota for distinct work', async () => {
    await create().expect(202);
    const response = await create('bbbbbbbbbbb').expect(429);
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
