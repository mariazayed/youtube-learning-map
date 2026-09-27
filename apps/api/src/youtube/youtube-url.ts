export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const LONG_FORM_HOSTS = new Set(['youtube.com', 'm.youtube.com']);
const PATH_VIDEO_TYPES = new Set(['shorts', 'embed', 'live']);

export class InvalidYouTubeUrlError extends Error {
  constructor(message = 'Enter a valid HTTPS YouTube video URL.') {
    super(message);
    this.name = 'InvalidYouTubeUrlError';
  }
}

export function assertYouTubeVideoId(videoId: string): string {
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new InvalidYouTubeUrlError(
      'The URL does not contain a valid YouTube video ID.',
    );
  }
  return videoId;
}

/**
 * Parses a URL locally and returns only its 11-character YouTube video ID. This function never
 * performs network I/O and never returns a user-controlled origin, path, query, or fragment.
 */
export function extractYouTubeVideoId(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidYouTubeUrlError();
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== ''
  ) {
    throw new InvalidYouTubeUrlError();
  }

  const pathSegments = url.pathname.split('/').filter(Boolean);
  let videoId: string | null = null;

  if (hostname === 'youtu.be') {
    if (pathSegments.length === 1) videoId = pathSegments[0] ?? null;
  } else if (LONG_FORM_HOSTS.has(hostname)) {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else if (pathSegments.length === 2 && PATH_VIDEO_TYPES.has(pathSegments[0] ?? '')) {
      videoId = pathSegments[1] ?? null;
    }
  } else {
    throw new InvalidYouTubeUrlError('Only official YouTube video URLs are supported.');
  }

  if (!videoId) {
    throw new InvalidYouTubeUrlError(
      'The URL does not identify a supported YouTube video.',
    );
  }
  return assertYouTubeVideoId(videoId);
}

/** Builds the only YouTube URL that may be persisted or sent to the analysis provider. */
export function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${assertYouTubeVideoId(videoId)}`;
}
