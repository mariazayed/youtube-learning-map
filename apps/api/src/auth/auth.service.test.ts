import { generateKeyPairSync, sign } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

const ISSUER = 'https://identity.example.test/';
const AUDIENCE = 'learnmap-api';
const JWKS_URL = 'https://identity.example.test/.well-known/jwks.json';
const KID = 'test-key';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = keys.publicKey.export({ format: 'jwk' });

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: vi.fn((key: string) => values[key]),
    getOrThrow: vi.fn((key: string) => {
      if (values[key] === undefined) throw new Error(`Missing ${key}`);
      return values[key];
    }),
  } as unknown as ConfigService;
}

function token(overrides: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: KID })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: ISSUER,
      aud: AUDIENCE,
      sub: 'student-123',
      exp: Math.floor(Date.now() / 1_000) + 300,
      email: 'LEARNER@EXAMPLE.COM',
      email_verified: true,
      name: 'Learner',
      ...overrides,
    }),
  ).toString('base64url');
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    keys.privateKey,
  ).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function oidcConfig(): ConfigService {
  return config({
    NODE_ENV: 'production',
    ALLOW_ANONYMOUS_AUTH: false,
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
    JWT_JWKS_URL: JWKS_URL,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthService', () => {
  it('allows a valid anonymous identity only in development compatibility mode', async () => {
    const service = new AuthService(
      config({ NODE_ENV: 'development', ALLOW_ANONYMOUS_AUTH: true }),
    );
    await expect(service.authenticate(undefined, 'client_123456789')).resolves.toEqual({
      id: 'client_123456789',
      mode: 'anonymous',
    });
  });

  it('rejects anonymous access in production', async () => {
    const service = new AuthService(
      config({ NODE_ENV: 'production', ALLOW_ANONYMOUS_AUTH: true }),
    );
    await expect(
      service.authenticate(undefined, 'client_123456789'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies an OIDC token and caches its signing keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new AuthService(oidcConfig());

    const first = await service.authenticate(`Bearer ${token()}`, undefined);
    const second = await service.authenticate(`Bearer ${token()}`, undefined);

    expect(first.id).toMatch(/^oidc:/);
    expect(first.mode).toBe('oidc');
    expect(first.email).toBe('learner@example.com');
    expect(first.name).toBe('Learner');
    expect(second.id).toBe(first.id);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ['wrong issuer', { iss: 'https://attacker.example/' }],
    ['wrong audience', { aud: 'another-api' }],
    ['expired token', { exp: Math.floor(Date.now() / 1_000) - 120 }],
  ])('rejects a token with %s', async (_label, overrides) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256' }] }),
            { status: 200 },
          ),
        ),
    );
    await expect(
      new AuthService(oidcConfig()).authenticate(`Bearer ${token(overrides)}`, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token whose signature was changed', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256' }] }),
            { status: 200 },
          ),
        ),
    );
    const original = token();
    const tampered = `${original.slice(0, -1)}${original.endsWith('a') ? 'b' : 'a'}`;
    await expect(
      new AuthService(oidcConfig()).authenticate(`Bearer ${tampered}`, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('maps an unavailable JWKS endpoint to a safe service error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private network detail')),
    );
    await expect(
      new AuthService(oidcConfig()).authenticate(`Bearer ${token()}`, undefined),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
