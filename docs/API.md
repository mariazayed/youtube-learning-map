# API contract

Base path: `/v1`

Production requests use a verified OIDC access token:

```http
Authorization: Bearer eyJ...
```

Local development may instead use `X-Client-Id` when `ALLOW_ANONYMOUS_AUTH=true`.
Production validation forbids that mode. Authentication details are in
[Phase 13 authentication and usage](AUTHENTICATION_AND_USAGE.md).

## Create analysis

```http
POST /v1/analyses
Content-Type: application/json
```

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "outputLanguage": "en"
}
```

Returns `202 Accepted` with the asynchronous acknowledgement:

```json
{ "id": "cm...", "status": "QUEUED" }
```

An existing matching record is acknowledged instead of creating duplicate work; its status can
also be `PROCESSING`, `COMPLETED`, or `FAILED`.

Accepted URL forms are standard watch, `youtu.be`, Shorts, embed, and live URLs over HTTPS. The
API parses the URL locally and never fetches the submitted address. It requires the video to
exist, be public and embeddable, provide usable title/thumbnail metadata, and remain within the
configured duration limit. See [YouTube integration](YOUTUBE_INTEGRATION.md).

## List history

```http
GET /v1/analyses
```

Returns at most the 50 most recent records belonging to the caller.

## Get analysis

```http
GET /v1/analyses/:id
```

Returns only when `:id` belongs to the authenticated user.

The response includes independent `outputLanguage` (`ar` or `en`) and `detectedLanguage` (`ar`,
`en`, `other`, or `null` while unknown). Clients must not infer either value from the interface
locale or from each other.

## Get status

```http
GET /v1/analyses/:id/status
```

Returns only processing fields: `id`, `status`, `progress`, `errorCode`, `errorMessage`, and
`completedAt`. The query is scoped to the authenticated user.

The Phase 11 web client polls the full detail endpoint every two seconds while a record is active
and stops for `COMPLETED` or `FAILED`. The progress field maps to the worker-backed learning phases
documented in [Phase 11 frontend](FRONTEND.md).

## Retry analysis

```http
POST /v1/analyses/:id/retry
```

Returns `202 Accepted`. Only a record in `FAILED` status can be retried.

## Delete analysis

```http
DELETE /v1/analyses/:id
```

Returns `204 No Content`. Queued jobs are removed before deletion. Processing analyses return
`409 Conflict` so the worker cannot write into a deleted record.

## Delete application account

```http
DELETE /v1/account
Content-Type: application/json
```

```json
{ "confirmation": "DELETE" }
```

Returns `204 No Content`. The API ignores all request-supplied identity and deletes the account
resolved from the verified access token. PostgreSQL cascades deletion to analyses and daily-usage
records. A processing analysis causes `409 Conflict`; retry after it reaches a terminal state.
This endpoint removes LearnMap application data, not the account held by the external identity
provider. Signing in again can create a new empty LearnMap account.

## Health

```http
GET /health
```

Checks PostgreSQL and Valkey connectivity. It intentionally does not call external AI or
YouTube services.

## Error format

All failures use a stable, safe response:

```json
{
  "statusCode": 400,
  "code": "BAD_REQUEST",
  "message": "The video must be public.",
  "requestId": "c47b...",
  "timestamp": "2026-09-03T12:00:00.000Z",
  "path": "/v1/analyses"
}
```

Validation may return `message` as an array. Send `X-Request-Id` to correlate a request, or use
the generated value returned in the same response header. Request bodies, authorization headers,
and URL query strings are excluded from structured request logs.

JSON bodies are limited to `REQUEST_BODY_LIMIT_BYTES` (16 KiB by default), must use
`application/json`, and reject unknown DTO properties. Responses carry `Cache-Control: no-store`.
Parser and server failures are converted to fixed public messages; raw provider errors never
cross the worker boundary.

The global default is 60 requests per 60 seconds per authenticated user (falling back to client
IP before authentication). Creation and retry use an additional strict Redis-backed limit of
5 per minute. Status polling uses an additional moderate limit of 30 per minute. A separate,
atomic PostgreSQL ledger allows five new, non-cached analyses per UTC day by default. All limits
are configurable; exceeded limits return `429 Too Many Requests`.

Swagger is served at `/docs` in local development.

Completed analysis records use the shared `@learnmap/contracts` runtime schema. See
[Shared analysis data contract](DATA_CONTRACT.md) for field limits, graph invariants, timestamp
rules, and a complete example.
