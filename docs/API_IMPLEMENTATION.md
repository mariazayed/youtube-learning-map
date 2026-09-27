# Phase 8 API implementation

> Phase 13 extends this foundation with a browser Authorization Code + PKCE flow, Redis-backed
> route profiles, and an atomic PostgreSQL daily-usage ledger. See
> [Authentication and usage controls](AUTHENTICATION_AND_USAGE.md).

This phase turns the NestJS application into the synchronous, authenticated trust boundary for
analysis creation and lifecycle management.

## Module layout

| Area                  | Responsibility                                                       |
| --------------------- | -------------------------------------------------------------------- |
| `auth`                | OIDC JWT verification, public-route metadata, current-user injection |
| `common/filters`      | Stable safe error serialization                                      |
| `common/guards`       | Authenticated-user-aware throttling                                  |
| `common/interceptors` | One structured completion log per request                            |
| `common/validation`   | Request IDs and bounded analysis IDs                                 |
| `analyses`            | HTTP controller, orchestration service, ownership repository, DTO    |
| `youtube`             | SSRF-resistant URL parsing and fixed-origin metadata lookup          |
| `queue`               | BullMQ handoff and queued-job removal                                |
| `health`              | Public PostgreSQL and Valkey liveness check                          |

## Authentication

Production expects `Authorization: Bearer <JWT>`. `AuthService` accepts only compact three-part
tokens using RS256 or ES256. It validates issuer, audience, expiration, optional not-before and
issued-at times, and verifies the signature with the matching `kid` from the configured JWKS.
It derives the database user ID from a SHA-256 hash of issuer plus subject, preventing raw external
subject identifiers from being exposed as record IDs. Verified email and name claims are synced
when available; an email is accepted only when `email_verified` is true.

The JWKS address comes only from environment configuration, must use HTTPS, does not follow
redirects, times out after five seconds, and is cached for five minutes. An unknown `kid` forces
one refresh to support normal key rotation. Client-supplied `jku` headers are ignored.

For a credential-free local start, set `ALLOW_ANONYMOUS_AUTH=true` and send a random 16–80
character `X-Client-Id`. Environment validation rejects this setting in production.

## Create flow

`POST /v1/analyses` performs these steps:

1. The global guard authenticates the caller and the user-aware throttler applies limits.
2. The user profile is upserted and the UTC daily creation limit is checked.
3. The untrusted URL is locally reduced to an 11-character YouTube video ID.
4. Metadata is fetched from the fixed YouTube Data API endpoint and validates existence, public
   visibility, embeddability, required display fields, and duration.
5. A SHA-256 cache key is generated from video ID, output language, prompt version, and schema
   version.
6. An existing user-owned record is acknowledged, avoiding duplicate work.
7. Otherwise a `QUEUED` record is created and a BullMQ job is added using
   `analysis-<analysisId>` as its stable deduplication ID.
8. Queue failure is compensated by marking the row `FAILED` with a safe retryable error.
9. The controller returns `202 Accepted` with only `id` and `status`.

Completed detail and history responses expose `detectedLanguage` independently from the submitted
`outputLanguage`. The API never infers one from the other; legacy rows return `null` until a source
language has been persisted.

The database uniqueness constraint handles concurrent identical requests. The repository catches
the unique-constraint race and returns the winner without enqueueing a duplicate job.

## Ownership and state safety

Every repository operation accepts the authenticated user ID. Missing and foreign records both
return the same `404`, so an analysis ID cannot be used to enumerate another user’s data.

Retry uses an atomic `updateMany` predicate requiring owner, ID, and `FAILED` state. If another
request changes the state first, the API returns `409`. Old retained queue jobs are removed before
requeueing. Deletion removes queued work first and rejects records currently in `PROCESSING` state.

## Global HTTP controls

- Helmet applies standard security response headers.
- CORS accepts only comma-separated origins from `WEB_URL`, supports credentials, and never uses
  a wildcard.
- The validation pipe strips no unknown data silently: unexpected DTO fields are rejected.
- Global throttling defaults to `RATE_LIMIT_MAX` requests per `RATE_LIMIT_TTL_MS`; create and retry
  use a tighter 10-per-minute rule.
- `X-Request-Id` accepts a safe 8–128 character value or generates a UUID and echoes it back.
- JSON request logs contain method, path without query text, response status, duration, request ID,
  and authenticated user ID. Bodies, tokens, and credentials are not logged.
- The global exception filter returns stable error codes and hides unhandled internal details.

## Endpoint matrix

| Method   | Path                      | Success | State/ownership behavior                       |
| -------- | ------------------------- | ------: | ---------------------------------------------- |
| `POST`   | `/v1/analyses`            |   `202` | Creates or acknowledges user-owned cache entry |
| `GET`    | `/v1/analyses`            |   `200` | Latest 50 records for caller                   |
| `GET`    | `/v1/analyses/:id`        |   `200` | Full owned record                              |
| `GET`    | `/v1/analyses/:id/status` |   `200` | Compact owned status                           |
| `POST`   | `/v1/analyses/:id/retry`  |   `202` | Only `FAILED` to `QUEUED`                      |
| `DELETE` | `/v1/analyses/:id`        |   `204` | Rejects `PROCESSING`                           |
| `GET`    | `/health`                 |   `200` | Public infrastructure health check             |

## Production checklist

1. Use an identity-provider access token intended for this API, not an ID token for another
   audience.
2. Set `ALLOW_ANONYMOUS_AUTH=false` and all three `JWT_*` variables.
3. Set exact HTTPS browser origins in `WEB_URL` and terminate TLS at the load balancer or service.
4. Put credentials in a managed secret store and restrict the YouTube API key.
5. Run `pnpm --filter @learnmap/database db:deploy` once before new application instances.
6. Use persistent managed PostgreSQL and Valkey/Redis and monitor failed jobs and queue depth.
7. Forward JSON logs and preserve `X-Request-Id` across the edge proxy.
