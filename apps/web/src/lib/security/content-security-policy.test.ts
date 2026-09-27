import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildContentSecurityPolicy } from './content-security-policy';

describe('web Content Security Policy', () => {
  it('keeps localized documents dynamic so every response receives a fresh nonce', () => {
    const layout = readFileSync(
      resolve(__dirname, '../../app/[locale]/layout.tsx'),
      'utf8',
    );
    expect(layout).toContain("export const dynamic = 'force-dynamic'");
    expect(layout).toContain('await connection()');
    expect(layout).toContain('await headers()');
    expect(layout).not.toContain('generateStaticParams');
  });

  it('uses a nonce, denies plugins and framing, and permits the privacy player', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com/v1');
    vi.stubEnv('NEXT_PUBLIC_OIDC_ISSUER', 'https://identity.example.com');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@sentry.example.com/1');
    const policy = buildContentSecurityPolicy('test-nonce', 'production');
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain('frame-src https://www.youtube-nocookie.com');
    expect(policy).toContain("connect-src 'self' https://api.example.com");
    expect(policy).toContain('https://sentry.example.com');
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain('*');
    vi.unstubAllEnvs();
  });

  it('permits development evaluation without forcing HTTPS upgrades', () => {
    const policy = buildContentSecurityPolicy('dev-nonce', 'development');
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain('upgrade-insecure-requests');
  });
});
