# How to run LearnMap

This guide explains how to run the complete Phase 1–16 LearnMap application locally. LearnMap
contains three applications:

- `web`: the Next.js student interface on port `3000`;
- `api`: the NestJS HTTP API on port `4000`; and
- `worker`: the BullMQ process that sends videos to Gemini and stores validated results.

PostgreSQL stores users and analyses. Valkey provides the queue, distributed rate limits, and the
worker heartbeat. All three applications must be running for a real analysis to complete.

## 1. Prerequisites

Install the following before opening the project:

| Tool           | Required version                | Purpose                          |
| -------------- | ------------------------------- | -------------------------------- |
| Node.js        | `24.x`                          | JavaScript runtime               |
| Corepack       | Included with Node.js           | Installs the pinned pnpm version |
| pnpm           | `11.19.0`                       | Workspace package manager        |
| Git            | Current supported version       | Source control                   |
| Docker         | Docker Desktop or Docker Engine | Runs PostgreSQL and Valkey       |
| Docker Compose | Compose v2 (`docker compose`)   | Starts local infrastructure      |

You also need:

- a Gemini API key;
- a Google Cloud API key with YouTube Data API v3 enabled; and
- a public, embeddable YouTube video no longer than 90 minutes for testing.

The normal automated tests use mock providers and do not consume Gemini or YouTube quota.

## 2. Extract and open the project

Extract `youtube-learning-map-phases-1-16.zip`. The archive contains one top-level folder named
`youtube-learning-map`. Open a terminal in that folder—not in the folder containing it.

Confirm the location by checking that the following files are visible:

```text
package.json
pnpm-workspace.yaml
turbo.json
apps/
packages/
infra/
```

## 3. Activate the pinned package manager

Run from the project root:

```bash
node --version
corepack enable
corepack install --global pnpm@11.19.0
pnpm --version
```

`node --version` must report version 24. `pnpm --version` must report `11.19.0`.

### Windows note

Use PowerShell or WSL 2. Docker Desktop must be open before setup. For the best WSL file-watching
performance, keep the project under the Linux filesystem, such as
`~/workspace/youtube-learning-map`, rather than under `/mnt/c`.

## 4. Configure environment variables

Create the untracked local environment file.

macOS, Linux, or WSL:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and set at least these two values:

```dotenv
GEMINI_API_KEY=your_real_gemini_key
YOUTUBE_API_KEY=your_real_youtube_data_api_key
```

Keep the remaining local defaults unchanged for the first run. In particular:

```dotenv
NODE_ENV=development
ALLOW_ANONYMOUS_AUTH=true
DATABASE_URL=postgresql://app_user:local_password@localhost:5432/youtube_learning?schema=public
REDIS_URL=redis://localhost:6379
```

Local anonymous mode lets you test without configuring Clerk, Auth0, or another OIDC tenant. It is
blocked automatically in production. Never commit `.env`, paste its contents into logs, or prefix
server secrets with `NEXT_PUBLIC_`.

Validate the configuration without displaying secret values:

```bash
pnpm env:check
```

## 5. Recommended automatic setup

The setup command installs locked dependencies, starts PostgreSQL and Valkey, waits for their
health checks, and applies all committed Prisma migrations.

Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./scripts/setup.ps1
```

macOS, Linux, or WSL:

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The temporary PowerShell execution-policy command affects only the current terminal window.

You can alternatively run the platform-independent command:

```bash
pnpm setup
```

When setup finishes, verify the database and queue:

```bash
pnpm doctor:services
pnpm infra:status
```

## 6. Manual setup alternative

Use these commands if you prefer to perform every setup step yourself:

```bash
pnpm install --frozen-lockfile
pnpm infra:check
pnpm infra:config
pnpm infra:up
pnpm --filter @learnmap/database db:deploy
pnpm doctor:services
```

Do not use `prisma db push`. Development and production both use the committed migration history;
production uses `prisma migrate deploy` through the `db:deploy` script.

## 7. Start the application

Start all applications from the repository root:

```bash
pnpm dev
```

Turborepo starts the web application, API, and worker together. Keep this terminal open. The first
Next.js compilation can take longer than later reloads.

Open these addresses after startup:

| Address                         | Purpose                                    |
| ------------------------------- | ------------------------------------------ |
| `http://localhost:3000/en`      | English interface                          |
| `http://localhost:3000/ar`      | Arabic RTL interface                       |
| `http://localhost:4000/health`  | API, database, queue, and worker readiness |
| `http://localhost:4000/docs`    | Swagger API documentation                  |
| `http://localhost:4000/metrics` | Local API Prometheus metrics               |
| `http://localhost:9464/health`  | Worker liveness                            |
| `http://localhost:9464/metrics` | Local worker Prometheus metrics            |

`GET /health` returns HTTP 503 until PostgreSQL, Valkey, and a fresh worker heartbeat are all
available. If the page is not ready immediately, wait up to 30 seconds and retry.

### Start each application separately

Separate terminals are useful when debugging:

```bash
pnpm --filter @learnmap/web dev
pnpm --filter @learnmap/api dev
pnpm --filter @learnmap/worker dev
```

Run one command in each terminal. PostgreSQL and Valkey must already be running.

## 8. Run the first analysis

1. Open `http://localhost:3000/en` or `http://localhost:3000/ar`.
2. Paste a public YouTube URL using a supported watch, `youtu.be`, Shorts, embed, or live format.
3. Select Arabic or English as the **analysis output language**. This is independent of the
   interface language and the language detected in the video.
4. Select **Analyze**.
5. The browser opens the result page and polls the API while the worker processes the job.
6. When processing completes, review the structured summary and interactive mind map.
7. Select a timestamp to seek the embedded video to the approximate relevant moment.

The video must exist, be public, be embeddable, and be no longer than the configured
`MAX_VIDEO_DURATION_SECONDS` value. Generated summaries can be incomplete and should not replace
the original educational material.

## 9. Optional local observability stack

Keep `pnpm dev` running, then open another terminal and run:

```bash
pnpm infra:observability
```

This starts the optional monitoring profile:

| Address                 | Service                            |
| ----------------------- | ---------------------------------- |
| `http://localhost:9090` | Prometheus metrics and alert rules |
| `http://localhost:9093` | Alertmanager                       |

The checked-in Alertmanager webhook is a local placeholder. Replace it with an approved alert
destination before production. Local metrics endpoints work without `METRICS_TOKEN` while it is
empty. Production validation requires a random token of at least 32 characters and private
network access to the metrics endpoints.

## 10. Run checks and tests

Run the complete non-browser quality gate:

```bash
pnpm validate
pnpm format:check
```

Useful individual commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm infra:check
pnpm workspace:check
```

Install the pinned Playwright browser once, then run the mocked browser journey:

```bash
pnpm test:e2e:install
pnpm test:e2e
```

Playwright tests use mocked identity, API, AI, and YouTube-player boundaries. They do not call
Gemini and do not require production credentials.

## 11. Production build and local production-mode start

Build every workspace:

```bash
pnpm build
```

After configuring a production-safe `.env` and running migrations, start the three built
applications in separate terminals:

```bash
pnpm --filter @learnmap/web start
pnpm --filter @learnmap/api start:prod
pnpm --filter @learnmap/worker start:prod
```

Actual production deployment additionally requires managed PostgreSQL and Valkey, OIDC/JWT
configuration, `ALLOW_ANONYMOUS_AUTH=false`, managed secrets, HTTPS, a strict CORS origin, Sentry,
private authenticated metrics scraping, backups, and external uptime monitoring. Follow
`docs/DEPLOYMENT.md`; the local Compose file is not a production deployment specification.

## 12. Stop or reset local services

Stop the development applications with `Ctrl+C`, then stop containers while preserving data:

```bash
pnpm infra:down
```

To permanently delete only the disposable local database and queue volumes:

```bash
pnpm infra:reset -- --confirm-data-loss
```

The reset cannot be undone. Never adapt this command for production infrastructure.

## 13. Troubleshooting

### `pnpm` is unavailable or has the wrong version

```bash
corepack enable
corepack install --global pnpm@11.19.0
pnpm --version
```

Close and reopen the terminal if Windows still uses an older executable from `PATH`.

### Docker is unavailable

Start Docker Desktop and wait until it reports that the engine is running. Then verify:

```bash
docker version
docker compose version
pnpm infra:up
```

### Port `3000`, `4000`, `5432`, `6379`, or `9464` is already in use

Stop the program or container that owns the port. On Windows PowerShell, inspect a port with:

```powershell
Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
```

On macOS, Linux, or WSL:

```bash
lsof -i :4000
```

Avoid changing only one port: the matching URLs and Compose mappings must remain consistent.

### PostgreSQL authentication fails

Confirm that `.env` uses the included local connection string and that the correct Compose project
is running:

```bash
pnpm infra:status
pnpm infra:logs
pnpm doctor:services
```

If an old disposable volume was initialized with different local credentials, use the explicit
local reset command in section 12, then run setup again.

### An analysis stays queued

Check the worker terminal first, then verify:

```bash
pnpm doctor:services
curl http://localhost:9464/health
curl http://localhost:4000/health
```

Make sure `pnpm dev` started `@learnmap/worker`, `REDIS_URL` is identical for API and worker, and
the Gemini key is configured.

### YouTube metadata or Gemini fails

Verify that `YOUTUBE_API_KEY` belongs to a project with YouTube Data API v3 enabled and that
`GEMINI_API_KEY` is active. Restart the API and worker after editing `.env`. Public client errors
are intentionally sanitized; use the structured server logs and stable `errorCode` values without
printing keys, complete prompts, model output, or authorization headers.

### The health endpoint returns 503

`/health` checks the database, queue, and worker heartbeat. Run:

```bash
pnpm infra:status
pnpm doctor:services
```

Then confirm the worker process is running and wait for its next heartbeat.

## Related documentation

- `README.md`: project overview and command reference
- `docs/DEVELOPMENT_ENVIRONMENT.md`: platform-specific environment details
- `docs/LOCAL_INFRASTRUCTURE.md`: PostgreSQL and Valkey operations
- `docs/AUTHENTICATION_AND_USAGE.md`: OIDC and usage limits
- `docs/OBSERVABILITY.md`: metrics, Sentry, uptime, alerts, and runbooks
- `docs/DEPLOYMENT.md`: production deployment requirements
- `docs/TESTING.md`: test strategy and AI-quality evaluation
