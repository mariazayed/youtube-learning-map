import { describe, expect, it } from 'vitest';
import {
  canonicalYouTubeUrl,
  extractYouTubeVideoId,
  InvalidYouTubeUrlError,
} from './youtube-url';

const VIDEO_ID = 'dQw4w9WgXcQ';

describe('extractYouTubeVideoId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${VIDEO_ID}`, VIDEO_ID],
    [`https://youtube.com/watch?v=${VIDEO_ID}&feature=share`, VIDEO_ID],
    [`https://m.youtube.com/watch?v=${VIDEO_ID}#details`, VIDEO_ID],
    [`https://youtu.be/${VIDEO_ID}`, VIDEO_ID],
    [`https://youtu.be/${VIDEO_ID}/?si=tracking`, VIDEO_ID],
    [`https://www.youtube.com/shorts/${VIDEO_ID}`, VIDEO_ID],
    [`https://www.youtube.com/embed/${VIDEO_ID}`, VIDEO_ID],
    [`https://www.youtube.com/live/${VIDEO_ID}`, VIDEO_ID],
    [`  https://www.youtube.com/watch?v=${VIDEO_ID}  `, VIDEO_ID],
  ])('parses %s', (url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });

  it.each([
    'not a URL',
    `http://www.youtube.com/watch?v=${VIDEO_ID}`,
    `ftp://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://example.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com.example.org/watch?v=${VIDEO_ID}`,
    `https://youtube.com@evil.example/watch?v=${VIDEO_ID}`,
    `https://user:password@youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com:444/watch?v=${VIDEO_ID}`,
    `https://youtube.com./watch?v=${VIDEO_ID}`,
    `https://youtu.be/${VIDEO_ID}/unexpected`,
    `https://youtube.com/shorts/${VIDEO_ID}/unexpected`,
    'https://youtube.com/watch?v=too-short',
    `https://youtube.com/playlist?list=${VIDEO_ID}`,
    'https://youtube.com/watch',
  ])('rejects unsupported or unsafe input %s', (url) => {
    expect(() => extractYouTubeVideoId(url)).toThrow(InvalidYouTubeUrlError);
  });
});

describe('canonicalYouTubeUrl', () => {
  it('builds a fixed-origin URL from a validated video ID', () => {
    expect(canonicalYouTubeUrl(VIDEO_ID)).toBe(
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    );
  });

  it('rejects unvalidated values', () => {
    expect(() => canonicalYouTubeUrl(`${VIDEO_ID}&next=https://evil.example`)).toThrow(
      InvalidYouTubeUrlError,
    );
  });
});
