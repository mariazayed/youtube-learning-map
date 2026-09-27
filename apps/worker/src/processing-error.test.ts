import { describe, expect, it } from 'vitest';
import { classifyFailure, ProcessingError } from './processing-error';

describe('retry classification', () => {
  it.each([
    ['PROVIDER_NETWORK_ERROR', true],
    ['PROVIDER_RATE_LIMIT', true],
    ['PROVIDER_TEMPORARILY_UNAVAILABLE', true],
    ['YOUTUBE_TEMPORARILY_UNAVAILABLE', true],
    ['VIDEO_NOT_PUBLIC', false],
    ['VIDEO_TOO_LONG', false],
    ['UNSUPPORTED_VIDEO', false],
    ['SAFETY_POLICY_REJECTION', false],
  ] as const)('preserves the %s retry decision', (code, retryable) => {
    expect(classifyFailure(new ProcessingError(code, retryable))).toMatchObject({
      code,
      retryable,
    });
  });

  it('fails unknown infrastructure errors safely and transiently', () => {
    const failure = classifyFailure(new Error('database password=secret'));
    expect(failure).toEqual({
      code: 'TEMPORARY_PROCESSING_FAILURE',
      retryable: true,
      safeMessage: 'The video could not be analyzed. Please retry later.',
    });
    expect(JSON.stringify(failure)).not.toContain('secret');
  });
});
