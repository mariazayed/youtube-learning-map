# Development environment

Phase 2 makes the local environment reproducible and self-diagnosing. The supported baseline
is Node.js 24, pnpm 11.19.0, Git, Docker with Compose, PostgreSQL 17, and Valkey 8.

## Choose one setup method

Use either native tools or the VS Code Dev Container. Do not mix the two during the same
development session because `localhost` and container service hostnames are different.

## Method A: native tools

### Windows 10 or 11

1. Install Git for Windows.
2. Install Docker Desktop and enable its WSL 2 backend.
3. Install a Node version manager or Node.js 24 directly.
4. Restart PowerShell after installation.
5. Confirm Docker Desktop is running.
6. Extract the project to a normal development path, not a protected system folder.
7. Open PowerShell in the repository root.
8. Run:

```powershell
corepack enable
corepack install --global pnpm@11.19.0
./scripts/setup.ps1
```

If PowerShell blocks local scripts for the current process, use:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./scripts/setup.ps1
```

This changes policy only for the current PowerShell process.

### WSL 2

Keep the repository inside the Linux filesystem, such as `~/workspace/youtube-learning-map`,
rather than `/mnt/c`, for better package-install and file-watching performance.

Make Docker Desktop's WSL integration available to the selected Linux distribution, then run:

```bash
corepack enable
corepack install --global pnpm@11.19.0
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### macOS or Linux

Install Docker Desktop on macOS or Docker Engine plus the Compose plugin on Linux. Install
Node.js 24 with your preferred version manager, then run:

```bash
corepack enable
corepack install --global pnpm@11.19.0
./scripts/setup.sh
```

## Method B: VS Code Dev Container

Requirements:

- Docker Desktop or Docker Engine
- VS Code
- Microsoft Dev Containers extension

Steps:

1. Open the repository in VS Code.
2. Run **Dev Containers: Reopen in Container**.
3. Wait for the container and dependency installation to complete.
4. Copy `.env.example` to `.env` if it does not exist.
5. Add the Google credentials.
6. Apply the migration:

```bash
pnpm --filter @learnmap/database db:deploy
```

7. Start the applications:

```bash
pnpm dev
```

The dev container pins the same Node and pnpm versions as native development. PostgreSQL and
Valkey run as sibling Compose services. Their connection variables are injected using the
service names `postgres` and `redis`.

## What automated setup does

`pnpm setup` performs these steps in order:

1. Rejects an unsupported Node major version.
2. Activates the exact pinned pnpm version through Corepack when necessary.
3. Creates `.env` from `.env.example` without overwriting an existing file.
4. Installs the lockfile exactly with `--frozen-lockfile`.
5. Validates Docker and Docker Compose availability.
6. Starts PostgreSQL and Valkey.
7. Waits for both configured TCP endpoints.
8. Applies committed Prisma migrations.
9. Reports missing credential names without printing values.

For a remote database and queue, skip local infrastructure:

```bash
node scripts/bootstrap.mjs --skip-infra
```

Configure the remote connection URLs in `.env` before starting the applications.

## Environment verification

Basic verification:

```bash
pnpm doctor
```

Include service connectivity:

```bash
pnpm doctor:services
```

Credential and URL presence check:

```bash
pnpm env:check
```

These tools never print secret values. The runtime performs a second, stricter validation
with shared Zod schemas when the API, worker, or web build starts.

## Expected local services

| Service    | Address                      | Purpose                        |
| ---------- | ---------------------------- | ------------------------------ |
| Next.js    | `http://localhost:3000`      | Student interface              |
| NestJS API | `http://localhost:4000/v1`   | Application API                |
| Swagger    | `http://localhost:4000/docs` | Interactive API documentation  |
| PostgreSQL | `localhost:5432`             | Durable application data       |
| Valkey     | `localhost:6379`             | BullMQ jobs and request limits |

Local anonymous mode requires no identity tenant. To test production-equivalent authentication,
register `http://localhost:3000/en/auth/callback` with a managed OIDC provider, configure every
`JWT_*` and `NEXT_PUBLIC_OIDC_*` value from `.env.example`, and set
`ALLOW_ANONYMOUS_AUTH=false`. See [Phase 13 authentication](AUTHENTICATION_AND_USAGE.md).

## Version policy

- `.nvmrc` pins the Node major for common version managers.
- `.node-version` pins the exact tested Node version.
- `packageManager` pins pnpm through Corepack.
- `engines` and `.npmrc` reject unsupported Node versions.
- `pnpm-lock.yaml` is committed and CI must use `--frozen-lockfile`.
- Container base images use an exact Node patch release.

Update runtime versions deliberately in one pull request. Change every pin together, reinstall,
then run lint, type checks, tests, and the production build.

## Stopping and resetting local services

Stop without deleting database data:

```bash
pnpm infra:down
```

Docker volumes deliberately survive normal stops. An intentional local reset requires an
explicit confirmation flag:

```bash
pnpm infra:reset -- --confirm-data-loss
```

That command deletes local database and queue data and should never be used against production
resources. See [Local infrastructure](LOCAL_INFRASTRUCTURE.md) for all lifecycle commands.
