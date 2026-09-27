import { describe, expect, it } from 'vitest';
import { timestampUrl } from './youtube-player';

describe('timestampUrl', () => {
  it('builds a canonical timestamp fallback URL', () => {
    expect(timestampUrl('dQw4w9WgXcQ', 65)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s',
    );
  });

  it('bounds and rounds unsafe timestamp values', () => {
    expect(timestampUrl('dQw4w9WgXcQ', -2)).toContain('&t=0s');
    expect(timestampUrl('dQw4w9WgXcQ', 9.9)).toContain('&t=9s');
  });
});
