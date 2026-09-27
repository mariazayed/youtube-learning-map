import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseIsoDuration, YoutubeService } from './youtube.service';
import { InvalidYouTubeUrlError } from './youtube-url';

const VIDEO_ID = 'dQw4w9WgXcQ';
const API_KEY = 'test-youtube-api-key';

function config(maximum = 5_400): ConfigService {
  return {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'YOUTUBE_API_KEY') return API_KEY;
      throw new Error(`Unexpected required configuration: ${key}`);
    }),
    get: vi.fn((key: string) =>
      key === 'MAX_VIDEO_DURATION_SECONDS' ? maximum : undefined,
    ),
  } as unknown as ConfigService;
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    id: VIDEO_ID,
    snippet: {
      title: 'A lesson',
      channelTitle: 'A teacher',
      thumbnails: {
        high: { url: 'https://i.ytimg.com/vi/example/hqdefault.jpg' },
      },
    },
    contentDetails: { duration: 'PT12M34S' },
    status: { privacyStatus: 'public', embeddable: true },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseIsoDuration', () => {
  it.each([
    ['PT1S', 1],
    ['PT12M34S', 754],
    ['PT2H3M4S', 7_384],
    ['P1DT2H', 93_600],
  ])('converts %s to seconds', (value, expected) => {
    expect(parseIsoDuration(value)).toBe(expected);
  });

  it.each(['', 'P', 'PT', 'PT0S', '12:34', 'PT1.5S', 'P999999999999999999999D'])(
    'rejects invalid or unusable duration %s',
    (value) => expect(() => parseIsoDuration(value)).toThrow(BadRequestException),
  );
});

describe('YoutubeService', () => {
  it('calls only the fixed videos.list endpoint and returns validated metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [video()] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new YoutubeService(config()).getMetadata(VIDEO_ID)).resolves.toEqual({
      title: 'A lesson',
      channelTitle: 'A teacher',
      thumbnailUrl: 'https://i.ytimg.com/vi/example/hqdefault.jpg',
      durationSeconds: 754,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(requestUrl.origin).toBe('https://www.googleapis.com');
    expect(requestUrl.pathname).toBe('/youtube/v3/videos');
    expect(requestUrl.searchParams.get('part')).toBe('snippet,contentDetails,status');
    expect(requestUrl.searchParams.get('id')).toBe(VIDEO_ID);
    expect(requestUrl.searchParams.get('key')).toBe(API_KEY);
    expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects an invalid ID before calling the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new YoutubeService(config()).getMetadata('not-valid'),
    ).rejects.toBeInstanceOf(InvalidYouTubeUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports an empty result as not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [] })));
    await expect(
      new YoutubeService(config()).getMetadata(VIDEO_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['private video', { status: { privacyStatus: 'private', embeddable: true } }],
    ['unlisted video', { status: { privacyStatus: 'unlisted', embeddable: true } }],
    ['non-embeddable video', { status: { privacyStatus: 'public', embeddable: false } }],
  ])('rejects a %s', async (_label, overrides) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ items: [video(overrides)] })),
    );
    await expect(
      new YoutubeService(config()).getMetadata(VIDEO_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts the exact duration limit and rejects longer videos', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ items: [video({ contentDetails: { duration: 'PT1M' } })] }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ items: [video({ contentDetails: { duration: 'PT1M1S' } })] }),
        ),
    );
    const service = new YoutubeService(config(60));
    await expect(service.getMetadata(VIDEO_ID)).resolves.toMatchObject({
      durationSeconds: 60,
    });
    await expect(service.getMetadata(VIDEO_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([
    ['missing title', { snippet: { ...video().snippet, title: '' } }],
    ['missing thumbnail', { snippet: { ...video().snippet, thumbnails: {} } }],
    ['missing embeddability', { status: { privacyStatus: 'public' } }],
    ['wrong video ID', { id: 'aaaaaaaaaaa' }],
  ])('rejects an invalid upstream response with %s', async (_label, overrides) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ items: [video(overrides)] })),
    );
    await expect(new YoutubeService(config()).getMetadata(VIDEO_ID)).rejects.toThrow();
  });

  it('does not expose an upstream error message', async () => {
    const privateMessage = 'API key secret diagnostic';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: { message: privateMessage } }, 403)),
    );
    try {
      await new YoutubeService(config()).getMetadata(VIDEO_ID);
      throw new Error('Expected metadata retrieval to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as Error).message).not.toContain(privateMessage);
    }
  });

  it('maps network and malformed JSON failures to a safe service error', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network details'))
      .mockResolvedValueOnce(new Response('{invalid', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = new YoutubeService(config());

    await expect(service.getMetadata(VIDEO_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.getMetadata(VIDEO_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
