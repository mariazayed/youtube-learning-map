import { describe, expect, it } from 'vitest';
import {
  accountDeletionRequestSchema,
  analysisAcceptedSchema,
  analysisSchema,
  analysisStatusResponseSchema,
  createAnalysisRequestSchema,
} from './index';

describe('API response contracts', () => {
  it('rejects request-supplied identity fields', () => {
    expect(() =>
      createAnalysisRequestSchema.parse({
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        outputLanguage: 'en',
        userId: 'attacker-selected-user',
      }),
    ).toThrow();
  });

  it('requires an explicit account-deletion confirmation without identity fields', () => {
    expect(accountDeletionRequestSchema.parse({ confirmation: 'DELETE' })).toEqual({
      confirmation: 'DELETE',
    });
    expect(() =>
      accountDeletionRequestSchema.parse({ confirmation: 'delete' }),
    ).toThrow();
    expect(() =>
      accountDeletionRequestSchema.parse({ confirmation: 'DELETE', userId: 'victim' }),
    ).toThrow();
  });

  it('accepts only the asynchronous acknowledgement fields', () => {
    expect(analysisAcceptedSchema.parse({ id: 'analysis-id', status: 'QUEUED' })).toEqual(
      { id: 'analysis-id', status: 'QUEUED' },
    );
    expect(() =>
      analysisAcceptedSchema.parse({
        id: 'analysis-id',
        status: 'QUEUED',
        progress: 0,
      }),
    ).toThrow();
  });

  it('validates the compact status response', () => {
    expect(
      analysisStatusResponseSchema.parse({
        id: 'analysis-id',
        status: 'PROCESSING',
        progress: 40,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
      }),
    ).toMatchObject({ status: 'PROCESSING', progress: 40 });
    expect(() =>
      analysisStatusResponseSchema.parse({
        id: 'analysis-id',
        status: 'PROCESSING',
        progress: 101,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
      }),
    ).toThrow();
  });

  it('keeps detected video language separate from requested output language', () => {
    const value = {
      id: 'analysis-id',
      youtubeVideoId: 'dQw4w9WgXcQ',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoTitle: 'Arabic lesson',
      channelTitle: 'Teacher',
      thumbnailUrl: null,
      durationSeconds: 120,
      outputLanguage: 'en',
      detectedLanguage: 'ar',
      status: 'PROCESSING',
      progress: 70,
      summary: null,
      mindMap: null,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-09-04T00:00:00.000Z',
      completedAt: null,
    } as const;

    expect(analysisSchema.parse(value)).toMatchObject({
      detectedLanguage: 'ar',
      outputLanguage: 'en',
    });
    expect(analysisSchema.parse({ ...value, detectedLanguage: null })).toMatchObject({
      detectedLanguage: null,
    });
  });
});
