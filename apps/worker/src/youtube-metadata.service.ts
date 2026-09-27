import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { ProcessingError } from './processing-error';

const YOUTUBE_VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const REQUEST_TIMEOUT_MS = 10_000;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const responseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().regex(VIDEO_ID_PATTERN),
            snippet: z
              .object({
                title: z.string().trim().min(1).max(500),
                channelTitle: z.string().trim().min(1).max(500),
              })
              .passthrough(),
            contentDetails: z.object({ duration: z.string().min(1) }).passthrough(),
            status: z
              .object({ privacyStatus: z.string(), embeddable: z.boolean() })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(1)
      .default([]),
  })
  .passthrough();

export type VerifiedYoutubeMetadata = {
  title: string;
  channelTitle: string;
  durationSeconds: number;
};

function parseDuration(value: string): number {
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/);
  if (!match || match.slice(1).every((part) => part === undefined)) {
    throw new ProcessingError('UNSUPPORTED_VIDEO', false);
  }
  const seconds =
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2] ?? 0) * 3_600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new ProcessingError('UNSUPPORTED_VIDEO', false);
  }
  return seconds;
}

@Injectable()
export class YoutubeMetadataService {
  constructor(private readonly config: ConfigService) {}

  async verify(videoId: string): Promise<VerifiedYoutubeMetadata> {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
      throw new ProcessingError('INVALID_VIDEO_ID', false);
    }
    const url = new URL(YOUTUBE_VIDEOS_ENDPOINT);
    url.search = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      id: videoId,
      key: this.config.getOrThrow<string>('YOUTUBE_API_KEY'),
    }).toString();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ProcessingError('YOUTUBE_TEMPORARILY_UNAVAILABLE', true);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ProcessingError('YOUTUBE_TEMPORARILY_UNAVAILABLE', true);
    }
    if (!response.ok) throw new ProcessingError('YOUTUBE_REQUEST_REJECTED', false);

    let input: unknown;
    try {
      input = await response.json();
    } catch {
      throw new ProcessingError('YOUTUBE_INVALID_RESPONSE', true);
    }
    const parsed = responseSchema.safeParse(input);
    if (!parsed.success) throw new ProcessingError('YOUTUBE_INVALID_RESPONSE', true);
    const video = parsed.data.items[0];
    if (!video || video.id !== videoId)
      throw new ProcessingError('VIDEO_NOT_FOUND', false);
    if (video.status.privacyStatus !== 'public') {
      throw new ProcessingError('VIDEO_NOT_PUBLIC', false);
    }
    if (!video.status.embeddable) {
      throw new ProcessingError('VIDEO_NOT_EMBEDDABLE', false);
    }
    const durationSeconds = parseDuration(video.contentDetails.duration);
    const maximum = this.config.get<number>('MAX_VIDEO_DURATION_SECONDS') ?? 5_400;
    if (durationSeconds > maximum) throw new ProcessingError('VIDEO_TOO_LONG', false);
    return {
      title: video.snippet.title,
      channelTitle: video.snippet.channelTitle,
      durationSeconds,
    };
  }
}
