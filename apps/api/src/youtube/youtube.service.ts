import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { assertYouTubeVideoId, YOUTUBE_VIDEO_ID_PATTERN } from './youtube-url';

const YOUTUBE_VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_REQUEST_TIMEOUT_MS = 10_000;

const thumbnailSchema = z
  .object({
    url: z
      .string()
      .url()
      .refine((url) => url.startsWith('https://')),
  })
  .passthrough();

const youtubeVideoResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().regex(YOUTUBE_VIDEO_ID_PATTERN),
            snippet: z
              .object({
                title: z.string().trim().min(1).max(500),
                channelTitle: z.string().trim().min(1).max(500),
                thumbnails: z
                  .object({
                    maxres: thumbnailSchema.optional(),
                    standard: thumbnailSchema.optional(),
                    high: thumbnailSchema.optional(),
                    medium: thumbnailSchema.optional(),
                    default: thumbnailSchema.optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
            contentDetails: z.object({ duration: z.string().min(1) }).passthrough(),
            status: z
              .object({
                privacyStatus: z.string(),
                embeddable: z.boolean(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(1)
      .default([]),
  })
  .passthrough();

type YoutubeVideo = z.infer<typeof youtubeVideoResponseSchema>['items'][number];

export type YoutubeMetadata = {
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number;
};

export function parseIsoDuration(value: string): number {
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/);
  if (!match || match.slice(1).every((component) => component === undefined)) {
    throw new BadRequestException('The video duration could not be read.');
  }

  const durationSeconds =
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2] ?? 0) * 3_600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
    throw new BadRequestException('The video duration could not be read.');
  }
  return durationSeconds;
}

function selectThumbnail(video: YoutubeVideo): string {
  const thumbnails = video.snippet.thumbnails;
  const url =
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url;
  if (!url) throw new BadRequestException('The video does not have a usable thumbnail.');
  return url;
}

@Injectable()
export class YoutubeService {
  constructor(private readonly config: ConfigService) {}

  async getMetadata(videoId: string): Promise<YoutubeMetadata> {
    assertYouTubeVideoId(videoId);
    const key = this.config.getOrThrow<string>('YOUTUBE_API_KEY');
    const requestUrl = new URL(YOUTUBE_VIDEOS_ENDPOINT);
    requestUrl.search = new URLSearchParams({
      part: 'snippet,contentDetails,status',
      id: videoId,
      key,
    }).toString();

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(YOUTUBE_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException(
        'YouTube metadata is temporarily unavailable.',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'YouTube metadata is temporarily unavailable.',
      );
    }

    let input: unknown;
    try {
      input = await response.json();
    } catch {
      throw new ServiceUnavailableException('YouTube returned an invalid response.');
    }
    const parsed = youtubeVideoResponseSchema.safeParse(input);
    if (!parsed.success) {
      throw new ServiceUnavailableException('YouTube returned an invalid response.');
    }

    const item = parsed.data.items[0];
    if (!item) throw new NotFoundException('The YouTube video was not found.');
    if (item.id !== videoId) {
      throw new ServiceUnavailableException('YouTube returned an invalid response.');
    }
    if (item.status.privacyStatus !== 'public') {
      throw new BadRequestException('The video must be public.');
    }
    if (item.status.embeddable !== true) {
      throw new BadRequestException('The video must allow embedding.');
    }

    const durationSeconds = parseIsoDuration(item.contentDetails.duration);
    const maximum = this.config.get<number>('MAX_VIDEO_DURATION_SECONDS') ?? 5_400;
    if (durationSeconds > maximum) {
      const formattedLimit =
        maximum % 60 === 0 ? `${maximum / 60} minutes` : `${maximum} seconds`;
      throw new BadRequestException(`The video cannot be longer than ${formattedLimit}.`);
    }

    return {
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: selectThumbnail(item),
      durationSeconds,
    };
  }
}
