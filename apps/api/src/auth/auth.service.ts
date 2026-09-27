import {
  createHash,
  createPublicKey,
  verify,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { isValidClientId } from '../common/client-id';
import type { AuthenticatedUser } from './authenticated-user';

const CLOCK_TOLERANCE_SECONDS = 60;
const JWKS_CACHE_MILLISECONDS = 5 * 60 * 1_000;
const JWKS_TIMEOUT_MILLISECONDS = 5_000;
const MAX_TOKEN_LENGTH = 8_192;

const jwtHeaderSchema = z
  .object({
    alg: z.enum(['RS256', 'ES256']),
    kid: z.string().min(1).max(200),
  })
  .passthrough();

const jwtClaimsSchema = z
  .object({
    iss: z.string().url(),
    aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    sub: z.string().min(1).max(500),
    exp: z.number().int().positive(),
    nbf: z.number().int().optional(),
    iat: z.number().int().optional(),
    email: z.string().email().max(320).optional(),
    email_verified: z.boolean().optional(),
    name: z.string().trim().min(1).max(200).optional(),
  })
  .passthrough();

const jsonWebKeySchema = z
  .object({
    kid: z.string().min(1).max(200),
    kty: z.enum(['RSA', 'EC']),
    alg: z.string().optional(),
    use: z.string().optional(),
  })
  .passthrough();

const jsonWebKeySetSchema = z
  .object({ keys: z.array(jsonWebKeySchema).min(1).max(100) })
  .passthrough();

type SupportedJwk = z.infer<typeof jsonWebKeySchema>;

function unauthorized(): never {
  throw new UnauthorizedException('A valid bearer token is required.');
}

function decodeJwtJson(segment: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) unauthorized();
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) unauthorized();
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    unauthorized();
  }
}

function verifySignature(
  algorithm: 'RS256' | 'ES256',
  key: KeyObject,
  signingInput: string,
  signature: Buffer,
): boolean {
  const data = Buffer.from(signingInput, 'ascii');
  if (algorithm === 'RS256') return verify('RSA-SHA256', data, key, signature);
  return verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
}

@Injectable()
export class AuthService {
  private cachedKeys?: { expiresAt: number; keys: SupportedJwk[] };
  private keysRequest: Promise<SupportedJwk[]> | undefined;

  constructor(private readonly config: ConfigService) {}

  async authenticate(
    authorization: string | undefined,
    clientId: string | undefined,
  ): Promise<AuthenticatedUser> {
    if (authorization !== undefined) {
      const match = authorization.match(
        /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/,
      );
      if (!match?.[1] || match[1].length > MAX_TOKEN_LENGTH) unauthorized();
      return this.verifyOidcToken(match[1]);
    }

    const anonymousAllowed = this.config.get<boolean>('ALLOW_ANONYMOUS_AUTH') ?? false;
    const environment = this.config.get<string>('NODE_ENV') ?? 'development';
    if (anonymousAllowed && environment !== 'production' && isValidClientId(clientId)) {
      return { id: clientId, mode: 'anonymous' };
    }
    unauthorized();
  }

  private async verifyOidcToken(token: string): Promise<AuthenticatedUser> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) unauthorized();
      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      if (!encodedHeader || !encodedPayload || !encodedSignature) unauthorized();

      const header = jwtHeaderSchema.parse(decodeJwtJson(encodedHeader));
      const claims = jwtClaimsSchema.parse(decodeJwtJson(encodedPayload));
      const issuer = this.config.getOrThrow<string>('JWT_ISSUER');
      const audience = this.config.getOrThrow<string>('JWT_AUDIENCE');
      const now = Math.floor(Date.now() / 1_000);

      if (claims.iss !== issuer) unauthorized();
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(audience)) unauthorized();
      if (claims.exp <= now - CLOCK_TOLERANCE_SECONDS) unauthorized();
      if (claims.nbf !== undefined && claims.nbf > now + CLOCK_TOLERANCE_SECONDS) {
        unauthorized();
      }
      if (claims.iat !== undefined && claims.iat > now + CLOCK_TOLERANCE_SECONDS) {
        unauthorized();
      }

      const jwk = await this.findSigningKey(header.kid, header.alg);
      let publicKey: KeyObject;
      try {
        publicKey = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
      } catch {
        throw new ServiceUnavailableException(
          'The authentication service is temporarily unavailable.',
        );
      }
      const signature = Buffer.from(encodedSignature, 'base64url');
      if (
        signature.toString('base64url') !== encodedSignature ||
        !verifySignature(
          header.alg,
          publicKey,
          `${encodedHeader}.${encodedPayload}`,
          signature,
        )
      ) {
        unauthorized();
      }

      const identityHash = createHash('sha256')
        .update(`${issuer}\0${claims.sub}`)
        .digest('base64url');
      const user: AuthenticatedUser = { id: `oidc:${identityHash}`, mode: 'oidc' };
      if (claims.email_verified === true && claims.email) {
        user.email = claims.email.toLowerCase();
      }
      if (claims.name) user.name = claims.name;
      return user;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (error instanceof UnauthorizedException) throw error;
      unauthorized();
    }
  }

  private async findSigningKey(
    keyId: string,
    algorithm: 'RS256' | 'ES256',
  ): Promise<SupportedJwk> {
    let keys = await this.loadKeys(false);
    let key = keys.find((candidate) => candidate.kid === keyId);
    if (!key) {
      keys = await this.loadKeys(true);
      key = keys.find((candidate) => candidate.kid === keyId);
    }
    if (
      !key ||
      (key.alg !== undefined && key.alg !== algorithm) ||
      (key.use !== undefined && key.use !== 'sig') ||
      (algorithm === 'RS256' && key.kty !== 'RSA') ||
      (algorithm === 'ES256' && key.kty !== 'EC')
    ) {
      unauthorized();
    }
    return key;
  }

  private async loadKeys(forceRefresh: boolean): Promise<SupportedJwk[]> {
    if (!forceRefresh && this.cachedKeys && this.cachedKeys.expiresAt > Date.now()) {
      return this.cachedKeys.keys;
    }
    if (!forceRefresh && this.keysRequest) return this.keysRequest;

    const request = this.fetchKeys();
    this.keysRequest = request;
    try {
      const keys = await request;
      this.cachedKeys = {
        keys,
        expiresAt: Date.now() + JWKS_CACHE_MILLISECONDS,
      };
      return keys;
    } finally {
      if (this.keysRequest === request) this.keysRequest = undefined;
    }
  }

  private async fetchKeys(): Promise<SupportedJwk[]> {
    const jwksUrl = this.config.getOrThrow<string>('JWT_JWKS_URL');
    try {
      const response = await fetch(jwksUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(JWKS_TIMEOUT_MILLISECONDS),
      });
      if (!response.ok) throw new Error('JWKS request failed.');
      const parsed = jsonWebKeySetSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('JWKS response is invalid.');
      return parsed.data.keys;
    } catch {
      throw new ServiceUnavailableException(
        'The authentication service is temporarily unavailable.',
      );
    }
  }
}
