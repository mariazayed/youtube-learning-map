# Security

## Implemented controls

- HTTPS-only YouTube URL acceptance
- Exact hostname allowlist
- Strict 11-character video ID validation
- Canonical server-created YouTube URL
- Rejection of URL credentials, nonstandard ports, hostname lookalikes, and extra path segments
- Fixed-origin YouTube metadata requests with redirects disabled and a 10-second timeout
- Runtime validation of YouTube metadata and sanitized upstream failures
- DTO whitelist and rejection of unexpected request fields
- Exact CORS origin configuration
- Helmet security headers
- API keys available only to server processes
- Prompt-injection boundary for video content
- Prompt-injection boundary for untrusted video metadata
- Provider interface prevents model transport details from spreading through worker logic
- Fixed Gemini API origin, bounded request timeout, and safe status classification
- Raw provider output is parsed, normalized, and validated without being logged
- Zod validation of every AI result
- Graph cycle, reachability, depth, width, and timestamp checks
- Ownership filtering on history, detail, and retry queries
- Bounded video duration, daily quota, worker concurrency, attempts, and timeouts
- Privacy-enhanced `youtube-nocookie.com` player
- Global OIDC authentication with RS256 and ES256 signature verification
- Exact issuer, audience, expiry, not-before, subject, key ID, key use, and key type validation
- Fixed HTTPS JWKS URL, disabled redirects, bounded response schema, timeout, and short cache
- Production startup rejection when anonymous authentication is enabled
- Browser OIDC Authorization Code flow with PKCE S256, state, nonce, and bounded transactions
- Session-scoped access-token storage with no browser client secret
- Redis-backed global, strict create/retry, and moderate status-poll throttling
- Atomic PostgreSQL daily quota accounting with UTC reset dates
- Request IDs, structured JSON logs, and a sanitized global error envelope
- Repository-level ownership predicates on every analysis read, mutation, and deletion
- Queue failure compensation and atomic failed-analysis retry transitions
- Strict minimal queue payloads that exclude credentials and user-provided URLs
- Worker-side video availability and duration revalidation before every attempt
- Permanent/transient failure allowlist with `UnrecoverableError` for non-retryable jobs
- Sanitized provider, database, network, and BullMQ error messages
- Shared-contract validation before frontend submission and after every API response
- Player and fallback URLs constructed only from the API-validated YouTube video ID
- New-tab fallback links use `noopener noreferrer`
- Browser preferences contain only the selected language and no credential or analysis payload
- Bidirectional isolation around generated and metadata text to contain mixed-script direction
- Explicit LTR isolation for timestamps, code samples, and embedded YouTube media
- Per-request nonce Content Security Policy for localized web routes
- Restrictive referrer, browser-permission, MIME-sniffing, and framing policies
- Bounded strict JSON request parsing and `no-store` API responses
- Capped and control-character-stripped client error messages
- Pseudonymous HMAC audit identifiers with no foreign key to deleted accounts
- Automated retention for terminal analyses and audit events under a PostgreSQL advisory lock
- Explicit account-deletion confirmation and authenticated analysis deletion in the UI
- Non-secret deployment labels that record key rotations without recording credentials

## Before a public or paid release

1. Store secrets in the hosting provider's secret manager.
2. Enable managed PostgreSQL backups and Redis/Valkey persistence.
3. Add dependency and container vulnerability scanning.
4. Complete a YouTube, Google API, privacy, and child-safety policy review appropriate to
   the launch audience and region.

## Reporting

Do not put secrets or private production data in a public issue. Use your organization's
private security reporting channel.

## YouTube SSRF boundary

The original submitted URL must never be fetched. `extractYouTubeVideoId` performs local parsing,
and `YoutubeService` accepts only the validated ID. It constructs the fixed Google API request,
while `canonicalYouTubeUrl` constructs the only YouTube URL stored or sent to the worker. See
[YouTube URL and metadata integration](YOUTUBE_INTEGRATION.md).

The operating model, retention schedule, deletion semantics, CSP, audit schema, and rotation
runbook are documented in [Phase 14 security and privacy](SECURITY_AND_PRIVACY.md).
