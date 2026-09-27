# Local infrastructure

Phase 4 provides a reproducible PostgreSQL and Valkey environment for local development. It is
designed for one developer workstation and is not a production deployment specification.

## Services

| Service    | Image                    | Host address     | Persistent volume                    |
| ---------- | ------------------------ | ---------------- | ------------------------------------ |
| PostgreSQL | `postgres:17-alpine`     | `127.0.0.1:5432` | `youtube-learning-map-postgres-data` |
| Valkey     | `valkey/valkey:8-alpine` | `127.0.0.1:6379` | `youtube-learning-map-valkey-data`   |

Both ports bind only to the loopback interface. Other computers on the network cannot connect
through these published ports. Containers communicate over the private `backend` bridge network.

PostgreSQL initializes a UTF-8 `youtube_learning` database. Valkey enables append-only persistence
and flushes it every second. Both services have health checks, persistent named volumes,
graceful-stop windows, and `no-new-privileges` enabled.

## First start

Create the untracked environment file:

```bash
cp .env.example .env
```

Add the two Google API keys, then validate and start the services:

```bash
pnpm env:check
pnpm infra:check
pnpm infra:config
pnpm infra:up
pnpm infra:status
```

`infra:check` validates the repository definition without Docker. `infra:config` asks Docker
Compose to validate the merged configuration. `infra:up` uses Compose's `--wait` option and does
not return successfully until both health checks pass.

Apply the database migration after the first start:

```bash
pnpm --filter @learnmap/database db:deploy
```

Validate the Prisma model without connecting to PostgreSQL with `pnpm db:validate`. See
[Database design and migrations](DATABASE.md) for the model, integrity rules, and safe migration
workflow.

The automated `pnpm setup` workflow performs these steps for a new checkout.

## Lifecycle commands

| Command             | Effect                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| `pnpm infra:up`     | Create or start services and wait until healthy                          |
| `pnpm infra:status` | Display service state and health                                         |
| `pnpm infra:logs`   | Show the latest 100 log lines without following indefinitely             |
| `pnpm infra:down`   | Stop containers and preserve data volumes                                |
| `pnpm infra:config` | Validate the Compose model                                               |
| `pnpm infra:check`  | Validate required services, health checks, volumes, and environment keys |

## Data reset

Normal shutdown preserves data. Reset only disposable local data:

```bash
pnpm infra:reset -- --confirm-data-loss
```

The explicit flag prevents accidental deletion. This removes the project containers, network,
and both named volumes. It cannot be undone. Never adapt this command to production resources.

## Environment contract

| Variable                              | Local value                | Consumer                                                      |
| ------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| `WEB_URL`                             | `http://localhost:3000`    | API CORS allowlist                                            |
| `API_URL`                             | `http://localhost:4000`    | Canonical API origin for tooling and deployment configuration |
| `NEXT_PUBLIC_API_URL`                 | `http://localhost:4000/v1` | Browser API requests                                          |
| `DATABASE_URL`                        | PostgreSQL URL             | API, worker, Prisma                                           |
| `REDIS_URL`                           | Valkey URL                 | API and worker                                                |
| `YOUTUBE_API_KEY`                     | Google API secret          | API and worker metadata validation                            |
| `GEMINI_API_KEY`                      | Gemini secret              | Worker only                                                   |
| `GEMINI_VIDEO_MODEL`                  | `gemini-3.8-flash`         | Worker                                                        |
| `GEMINI_AGENTIC_MIN_DURATION_SECONDS` | `300`                      | Worker long-video mode threshold                              |
| `GEMINI_REQUEST_TIMEOUT_MS`           | `720000`                   | Worker provider request timeout                               |
| `JWT_ISSUER`                          | OIDC issuer URL            | API authentication in production                              |
| `JWT_AUDIENCE`                        | API audience               | API authentication in production                              |
| `JWT_JWKS_URL`                        | HTTPS JWKS endpoint        | API signature verification in production                      |

Local development may leave the JWT values empty while `ALLOW_ANONYMOUS_AUTH=true`. Production
validation requires anonymous access to be disabled and all three JWT values to be present. Never
expose server secrets through `NEXT_PUBLIC_*`.

## Local credentials

The database username and password in Compose are intentionally fixed development-only values.
They make a clean checkout deterministic and are not secrets. Production must use unique managed
credentials, TLS connections, restricted networks, backups, and a secret manager.

Valkey has no password because it is loopback-only on the host and isolated on the Compose
network. Do not expose this configuration publicly. Production queues require private networking,
authentication where supported, encryption in transit, persistence, and a `noeviction` policy.

## Health checks

PostgreSQL uses `pg_isready` against the configured local database. Valkey uses `PING`. After
startup, verify connectivity from the host:

```bash
pnpm doctor:services
```

For detailed service output:

```bash
pnpm infra:status
pnpm infra:logs
```
