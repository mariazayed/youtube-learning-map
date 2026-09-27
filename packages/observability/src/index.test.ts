import { describe, expect, it } from 'vitest';
import {
  createLogEvent,
  redactSensitiveText,
  scrubTelemetryEvent,
  timingSafeTokenMatches,
} from './index';

describe('privacy-safe observability primitives', () => {
  it('keeps correlation fields and strips sensitive or nested data', () => {
    const log = createLogEvent('analysis_completed', {
      requestId: 'request-12345678',
      analysisId: 'analysis-123',
      userId: 'issuer-scoped-user',
      videoId: 'dQw4w9WgXcQ',
      provider: 'gemini',
      model: 'gemini-test',
      status: 'COMPLETED',
      durationMs: 1_234,
      attemptNumber: 2,
      errorCode: 'NONE',
      authorization: 'Bearer secret-token',
      apiKey: 'secret-key',
      databaseUrl: 'postgresql://user:secret@host/database',
      headers: { authorization: 'Bearer secret-token' },
    });

    expect(log).toMatchObject({
      event: 'analysis_completed',
      requestId: 'request-12345678',
      analysisId: 'analysis-123',
      userId: 'issuer-scoped-user',
      videoId: 'dQw4w9WgXcQ',
      provider: 'gemini',
      model: 'gemini-test',
      status: 'COMPLETED',
      durationMs: 1_234,
      attemptNumber: 2,
      errorCode: 'NONE',
    });
    expect(JSON.stringify(log)).not.toMatch(/secret|authorization|databaseUrl/u);
  });

  it('normalizes control characters and bounds string fields', () => {
    const log = createLogEvent('http_request_completed', {
      path: `/analyses\n${'x'.repeat(300)}`,
    });
    expect(log.path).not.toContain('\n');
    expect(log.path?.length).toBeLessThanOrEqual(160);
  });

  it('compares metrics tokens without accepting prefixes', () => {
    expect(timingSafeTokenMatches('a'.repeat(32), 'a'.repeat(32))).toBe(true);
    expect(timingSafeTokenMatches('a'.repeat(32), 'a'.repeat(31))).toBe(false);
    expect(timingSafeTokenMatches('a'.repeat(32), 'b'.repeat(32))).toBe(false);
  });

  it('redacts credentials and connection strings from telemetry text', () => {
    expect(
      redactSensitiveText(
        'Bearer secret.jwt token=abc DATABASE postgresql://user:pass@db/app redis://:pass@cache:6379',
      ),
    ).toBe(
      'Bearer [REDACTED] token=[REDACTED] DATABASE [REDACTED_CONNECTION_URL] [REDACTED_CONNECTION_URL]',
    );
  });

  it('removes request and breadcrumb payloads from vendor-neutral events', () => {
    const event = scrubTelemetryEvent({
      message: 'password=hunter2',
      exception: { values: [{ value: 'redis://:secret@cache:6379 failed' }] },
      breadcrumbs: [{ message: 'api_key=secret', data: { prompt: 'private' } }],
      request: {
        url: 'https://api.example.test/path?token=secret',
        headers: { authorization: 'Bearer secret' },
        data: { prompt: 'private' },
      },
    });

    expect(event.message).toBe('password=[REDACTED]');
    expect(event.exception?.values?.[0]?.value).not.toContain('secret');
    expect(event.breadcrumbs?.[0]).toEqual({ message: 'api_key=[REDACTED]' });
    expect(event.request).toEqual({ url: 'https://api.example.test/path' });
  });
});
