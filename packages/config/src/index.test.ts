import { describe, expect, it } from 'vitest';
import {
  validateApiEnvironment,
  validateWebEnvironment,
  validateWorkerEnvironment,
} from './index';

const common = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app',
  REDIS_URL: 'redis://localhost:6379',
};

describe('environment validation', () => {
  it('coerces and defaults API values', () => {
    const result = validateApiEnvironment({
      ...common,
      API_URL: 'http://localhost:4000',
      WEB_URL: 'http://localhost:3000',
      YOUTUBE_API_KEY: 'youtube-test-key',
    });
    expect(result.PORT).toBe(4_000);
    expect(result.MAX_VIDEO_DURATION_SECONDS).toBe(5_400);
    expect(result.ALLOW_ANONYMOUS_AUTH).toBe(true);
  });

  it('accepts empty authentication placeholders before authentication is enabled', () => {
    const result = validateApiEnvironment({
      ...common,
      API_URL: 'http://localhost:4000',
      WEB_URL: 'http://localhost:3000',
      YOUTUBE_API_KEY: 'youtube-test-key',
      JWT_ISSUER: '',
      JWT_AUDIENCE: '',
    });
    expect(result.JWT_ISSUER).toBeUndefined();
    expect(result.JWT_AUDIENCE).toBeUndefined();
  });

  it('rejects an invalid configured JWT issuer', () => {
    expect(() =>
      validateApiEnvironment({
        ...common,
        API_URL: 'http://localhost:4000',
        WEB_URL: 'http://localhost:3000',
        YOUTUBE_API_KEY: 'youtube-test-key',
        JWT_ISSUER: 'not-a-url',
      }),
    ).toThrow('JWT_ISSUER');
  });

  it('requires complete JWT configuration when anonymous access is disabled', () => {
    expect(() =>
      validateApiEnvironment({
        ...common,
        API_URL: 'http://localhost:4000',
        WEB_URL: 'http://localhost:3000',
        YOUTUBE_API_KEY: 'youtube-test-key',
        ALLOW_ANONYMOUS_AUTH: 'false',
      }),
    ).toThrow('JWT_ISSUER');
  });

  it('fails closed when anonymous access is enabled in production', () => {
    expect(() =>
      validateApiEnvironment({
        ...common,
        NODE_ENV: 'production',
        API_URL: 'https://api.example.com',
        WEB_URL: 'https://app.example.com',
        YOUTUBE_API_KEY: 'youtube-test-key',
        ALLOW_ANONYMOUS_AUTH: 'true',
      }),
    ).toThrow('ALLOW_ANONYMOUS_AUTH');
  });

  it('accepts complete production OIDC configuration', () => {
    const result = validateApiEnvironment({
      ...common,
      NODE_ENV: 'production',
      API_URL: 'https://api.example.com',
      WEB_URL: 'https://app.example.com',
      YOUTUBE_API_KEY: 'youtube-test-key',
      ALLOW_ANONYMOUS_AUTH: 'false',
      JWT_ISSUER: 'https://identity.example.com/',
      JWT_AUDIENCE: 'learnmap-api',
      JWT_JWKS_URL: 'https://identity.example.com/.well-known/jwks.json',
      AUDIT_HASH_PEPPER: 'a-production-audit-pepper-at-least-32-chars',
      GEMINI_KEY_VERSION: 'gemini-2026-09',
      YOUTUBE_KEY_VERSION: 'youtube-2026-09',
      METRICS_TOKEN: 'a-production-metrics-token-at-least-32-chars',
    });
    expect(result.ALLOW_ANONYMOUS_AUTH).toBe(false);
    expect(result.JWT_AUDIENCE).toBe('learnmap-api');
  });

  it('requires audit and key-rotation controls in production', () => {
    expect(() =>
      validateApiEnvironment({
        ...common,
        NODE_ENV: 'production',
        API_URL: 'https://api.example.com',
        WEB_URL: 'https://app.example.com',
        YOUTUBE_API_KEY: 'youtube-test-key',
        ALLOW_ANONYMOUS_AUTH: 'false',
        JWT_ISSUER: 'https://identity.example.com/',
        JWT_AUDIENCE: 'learnmap-api',
        JWT_JWKS_URL: 'https://identity.example.com/.well-known/jwks.json',
      }),
    ).toThrow('AUDIT_HASH_PEPPER');
  });

  it('rejects missing worker credentials', () => {
    expect(() => validateWorkerEnvironment(common)).toThrow('GEMINI_API_KEY');
  });

  it('requires metrics authentication for a production worker', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...common,
        NODE_ENV: 'production',
        GEMINI_API_KEY: 'gemini-test-key',
        YOUTUBE_API_KEY: 'youtube-test-key',
      }),
    ).toThrow('METRICS_TOKEN');
  });

  it('validates all worker queue and metadata settings', () => {
    const result = validateWorkerEnvironment({
      ...common,
      GEMINI_API_KEY: 'gemini-test-key',
      GEMINI_VIDEO_MODEL: 'gemini-test-model',
      YOUTUBE_API_KEY: 'youtube-test-key',
      WORKER_CONCURRENCY: '4',
      MAX_VIDEO_DURATION_SECONDS: '3600',
    });
    expect(result.WORKER_CONCURRENCY).toBe(4);
    expect(result.MAX_VIDEO_DURATION_SECONDS).toBe(3_600);
    expect(result.GEMINI_AGENTIC_MIN_DURATION_SECONDS).toBe(300);
    expect(result.GEMINI_REQUEST_TIMEOUT_MS).toBe(720_000);
    expect(result.WORKER_METRICS_PORT).toBe(9_464);
    expect(result.WORKER_HEARTBEAT_TTL_SECONDS).toBe(45);
    expect(result.AI_ESTIMATED_COST_PER_VIDEO_MINUTE_USD).toBe(0);
  });

  it('rejects non-HTTP public API URLs', () => {
    expect(() =>
      validateWebEnvironment({ NEXT_PUBLIC_API_URL: 'file:///tmp/api' }),
    ).toThrow();
  });

  it('requires complete browser OIDC configuration', () => {
    expect(() =>
      validateWebEnvironment({
        NEXT_PUBLIC_API_URL: 'http://localhost:4000/v1',
        NEXT_PUBLIC_OIDC_ISSUER: 'https://identity.example.com',
      }),
    ).toThrow('NEXT_PUBLIC_OIDC');
  });

  it('accepts a complete browser OIDC configuration', () => {
    expect(
      validateWebEnvironment({
        NEXT_PUBLIC_API_URL: 'https://api.example.com/v1',
        NEXT_PUBLIC_OIDC_ISSUER: 'https://identity.example.com',
        NEXT_PUBLIC_OIDC_CLIENT_ID: 'learnmap-web',
        NEXT_PUBLIC_OIDC_AUDIENCE: 'learnmap-api',
        NEXT_PUBLIC_OIDC_REDIRECT_URI: 'https://app.example.com/en/auth/callback',
      }),
    ).toMatchObject({ NEXT_PUBLIC_OIDC_CLIENT_ID: 'learnmap-web' });
  });

  it('validates optional Sentry and metrics settings without exposing secrets', () => {
    const result = validateWorkerEnvironment({
      ...common,
      GEMINI_API_KEY: 'gemini-test-key',
      YOUTUBE_API_KEY: 'youtube-test-key',
      SENTRY_DSN: 'https://public@sentry.example.com/1',
      SENTRY_TRACES_SAMPLE_RATE: '0.25',
      METRICS_TOKEN: 'm'.repeat(32),
      AI_ESTIMATED_COST_PER_VIDEO_MINUTE_USD: '0.004',
    });
    expect(result.SENTRY_TRACES_SAMPLE_RATE).toBe(0.25);
    expect(result.AI_ESTIMATED_COST_PER_VIDEO_MINUTE_USD).toBe(0.004);
    expect(() =>
      validateWorkerEnvironment({
        ...common,
        GEMINI_API_KEY: 'gemini-test-key',
        YOUTUBE_API_KEY: 'youtube-test-key',
        METRICS_TOKEN: 'short',
      }),
    ).toThrow('METRICS_TOKEN');
  });
});
