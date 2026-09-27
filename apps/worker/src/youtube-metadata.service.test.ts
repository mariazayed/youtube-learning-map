import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProcessingError } from './processing-error';
import { YoutubeMetadataService } from './youtube-metadata.service';

const VIDEO_ID = 'dQw4w9WgXcQ';

function config(maximum = 5_400): ConfigService {
  return {
    getOrThrow: vi.fn().mockReturnValue('youtube-test-api-key'),
    get: vi.fn().mockReturnValue(maximum),
  } as unknown as ConfigService;
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    items: [
      {
        id: VIDEO_ID,
        snippet: { title: 'Lesson', channelTitle: 'Teacher' },
        contentDetails: { duration: 'PT10M' },
        status: { privacyStatus: 'public', embeddable: true },
        ...overrides,
      },
    ],
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function capture(promise: Promise<unknown>): Promise<ProcessingError> {
  try {
    await promise;
    throw new Error('Expected failure.');
  } catch (error) {
    expect(error).toBeInstanceOf(ProcessingError);
    return error as ProcessingError;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('YoutubeMetadataService', () => {
  it('uses the fixed endpoint and returns public metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(video()));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new YoutubeMetadataService(config()).verify(VIDEO_ID)).resolves.toEqual({
      title: 'Lesson',
      channelTitle: 'Teacher',
      durationSeconds: 600,
    });
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.origin).toBe('https://www.googleapis.com');
    expect(url.pathname).toBe('/youtube/v3/videos');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
  });

  it.each([
    [{ status: { privacyStatus: 'private', embeddable: true } }, 'VIDEO_NOT_PUBLIC'],
    [{ status: { privacyStatus: 'public', embeddable: false } }, 'VIDEO_NOT_EMBEDDABLE'],
    [{ contentDetails: { duration: 'LIVE' } }, 'UNSUPPORTED_VIDEO'],
  ])('classifies invalid video metadata as permanent', async (overrides, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(video(overrides))));
    const error = await capture(new YoutubeMetadataService(config()).verify(VIDEO_ID));
    expect(error).toMatchObject({ code, retryable: false });
  });

  it('does not retry videos over the duration limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(video())));
    const error = await capture(new YoutubeMetadataService(config(599)).verify(VIDEO_ID));
    expect(error).toMatchObject({ code: 'VIDEO_TOO_LONG', retryable: false });
  });

  it.each([429, 500, 503])('retries temporary HTTP %s responses', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, status)));
    const error = await capture(new YoutubeMetadataService(config()).verify(VIDEO_ID));
    expect(error.retryable).toBe(true);
  });

  it('sanitizes and retries network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret diagnostic')));
    const error = await capture(new YoutubeMetadataService(config()).verify(VIDEO_ID));
    expect(error).toMatchObject({
      code: 'YOUTUBE_TEMPORARILY_UNAVAILABLE',
      retryable: true,
    });
    expect(error.message).not.toContain('secret');
  });
});
