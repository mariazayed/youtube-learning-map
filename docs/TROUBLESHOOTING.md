# Troubleshooting

## The history cannot load

Confirm PostgreSQL and Valkey are healthy:

```bash
pnpm infra:status
curl http://localhost:4000/health
```

If a service is unhealthy, inspect its latest logs with `pnpm infra:logs`.

## An analysis stays queued

The worker is not consuming jobs. Confirm `@learnmap/worker` appears in `pnpm dev` output and
that it uses the same `REDIS_URL` as the API.

## YouTube reports an API error

Confirm YouTube Data API v3 is enabled, the key is correct, and its API restriction allows
that API. Private, unlisted, unavailable, non-embeddable, or over-limit videos are rejected.

## Gemini rejects the request

Confirm the API key, configured model, region/account availability, and current public
YouTube URL preview support. The model name is intentionally configurable. Do not solve this
by scraping captions or downloading videos without a separate policy and reliability review.

## Prisma cannot connect

Check `DATABASE_URL`, ensure the Postgres container is healthy, and apply migrations:

```bash
pnpm --filter @learnmap/database db:deploy
```

## Ports are already in use

The defaults are web `3000`, API `4000`, PostgreSQL `5432`, and Valkey `6379`. Stop the
conflicting process or change the relevant local port and connection value consistently.

## Docker Compose configuration is rejected

Run the repository-level and Docker-level checks separately:

```bash
pnpm infra:check
pnpm infra:config
```

The first command works without Docker and catches missing services, volumes, health checks, or
environment keys. The second requires a running Docker installation and validates the complete
Compose model.

## Containers start but setup times out

Check `pnpm infra:status` and `pnpm infra:logs`. A container can be running before its service is
healthy. Do not remove health checks or the `--wait` behavior. Fix the reported PostgreSQL or
Valkey error, then run `pnpm infra:up` again.

## History disappeared

Anonymous development history is associated with an ID stored in browser local storage. Clearing
site data creates a new identity. The old database records remain but are intentionally not
exposed to the new browser ID.
