# Deployment outline

The application is packaged for local execution. For a production deployment, use four managed
components in one region:

1. Next.js web service
2. NestJS API web service
3. Continuously running worker service
4. Managed PostgreSQL and persistent Valkey/Redis

Render supports Next.js web services, managed PostgreSQL, Redis-compatible Key Value storage,
and background workers. Equivalent container platforms are also suitable.

## Build commands

```bash
pnpm install --frozen-lockfile
pnpm --filter @learnmap/database db:generate
pnpm build
pnpm validate
pnpm test:e2e:install
pnpm test:e2e
```

Run migrations once per release:

```bash
pnpm --filter @learnmap/database db:deploy
```

This command uses `prisma migrate deploy`. Run it as one release job before switching traffic;
do not run `migrate dev`, `db push`, or automatic schema synchronization in production. Take a
verified backup before destructive migrations. See [Database design](DATABASE.md).

Prompt, model, schema, and mind-map policy releases must also pass the locked 20-video quality
evaluation described in [Testing and AI quality](TESTING.md). Store its scored JSON report with
the release evidence; never place production Gemini credentials in normal CI test jobs.

Start commands:

```bash
pnpm --filter @learnmap/web start
pnpm --filter @learnmap/api start:prod
pnpm --filter @learnmap/worker start:prod
```

## Required production configuration

- Set `NODE_ENV=production` and `ALLOW_ANONYMOUS_AUTH=false`.
- Configure `JWT_ISSUER`, `JWT_AUDIENCE`, and an HTTPS `JWT_JWKS_URL` for the identity provider.
- Configure all four `NEXT_PUBLIC_OIDC_*` browser values and register the exact callback URL.
- Set exact `WEB_URL`, `API_URL`, and `NEXT_PUBLIC_API_URL` values.
- Smoke-test `/en`, `/ar`, both localized history routes, and a localized result route after each
  web deployment.
- Store keys as managed secrets.
- Generate a unique `AUDIT_HASH_PEPPER` of at least 32 random characters and store it as a secret.
- Set non-secret `GEMINI_KEY_VERSION` and `YOUTUBE_KEY_VERSION` deployment labels.
- Review `ANALYSIS_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, and local legal requirements.
- Set queue memory policy to `noeviction` and enable persistence.
- Use the same persistent Redis/Valkey service for distributed short-window request counters.
- Enable PostgreSQL backups and connection pooling.
- Configure `/health` as the API health check.
- Run at least one worker continuously.
- Give workers a termination grace period long enough to finish in-flight provider calls.
- Start with `WORKER_CONCURRENCY=2`, then scale using queue age and provider quotas.
- Set `GEMINI_AGENTIC_MIN_DURATION_SECONDS` for the latency/quality tradeoff; start at `300`.
- Keep `GEMINI_REQUEST_TIMEOUT_MS` below the platform termination grace period.
- Set a random `METRICS_TOKEN` of at least 32 characters in both API and worker services.
- Configure separate Sentry DSNs, immutable release names, environments, and trace sampling.
- Give the web build job short-lived source-map upload credentials; never expose them to browsers.
- Scrape the private API and worker metrics endpoints and restrict them at the network layer.
- Configure two-region uptime monitoring against `/health` and route tested alerts on call.
- Add centralized JSON log ingestion without headers, tokens, prompts, model output, or URLs.
- Restrict the YouTube API key to YouTube Data API v3.
- Apply database migrations before switching application traffic.

Environment parsing fails before NestJS starts when a required production authentication value
is missing or anonymous mode is enabled. The JWKS URL is operator-controlled, HTTPS-only, fetched
without redirects, and cached for five minutes. Rotate keys by publishing both old and new keys
for at least that interval.

The worker also requires `YOUTUBE_API_KEY` because it revalidates video visibility,
embeddability, metadata, and duration immediately before analysis. See
[Phase 9 BullMQ worker](BULLMQ_WORKER.md) for retry classes, progress, job retention, graceful
shutdown, and monitoring guidance.
See [Phase 10 AI provider](AI_PROVIDER.md) for model compatibility, prompt security, structured
output, static/agentic processing, and provider timeout guidance.
See [Phase 11 frontend](FRONTEND.md) for locale routing, browser/API configuration, player
fallback behavior, and accessibility checks.
Deploy the Phase 12 detected-language migration before the new worker starts writing completed
results. Then smoke-test mixed interface/output combinations using the matrix in
[Phase 12 internationalization](INTERNATIONALIZATION.md).

Deploy API, worker, and web with matching `SENTRY_RELEASE` values, confirm metrics authentication,
then exercise a warning and critical alert before directing normal traffic. The complete dashboard
queries, security posture, alert rules, and runbooks are in [Phase 16 observability](OBSERVABILITY.md).

Deploy the Phase 13 daily-usage migration before the new API. Then configure the managed OIDC
application for Authorization Code with PKCE, disable anonymous mode, and smoke-test ownership
isolation and the three request-limit profiles. Full rollout and rollback-safe ordering is in
[Phase 13 authentication and usage](AUTHENTICATION_AND_USAGE.md).

Deploy the Phase 14 audit migration before the new API. Production environment validation refuses
to start without the audit pepper and both secret-version labels. Use a managed secret reference,
not a plaintext image layer, repository variable, or committed `.env` file. Grant the API access
only to the YouTube key and audit pepper; grant the worker access only to the Gemini and YouTube
keys. If the platform cannot scope one deployment's variables per process, deploy separate service
definitions.

Rotate each Google key by creating and restricting its replacement, updating the managed secret,
bumping the matching version label, rolling API/worker instances, verifying health and one sample
analysis, and only then revoking the old key. The API records one deduplicated pseudonymous audit
event per new version label; it never records the secret. Emergency rotation skips the overlap but
still bumps the label. See [Phase 14 security and privacy](SECURITY_AND_PRIVACY.md) for the full
runbook and retention rollback considerations.
