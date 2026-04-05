# Repo-Pulse

Repo-Pulse is a monorepo for an AI-assisted repository monitoring platform. It includes:

- `apps/web`: Vite + React frontend
- `apps/api`: NestJS backend
- `packages/database`: Prisma client and schema
- `packages/shared`: shared constants and types
- `packages/ai-sdk`: AI provider abstraction

## Tech Stack

- Node.js 20+
- pnpm workspace
- Turbo
- React 19 + Vite 7
- NestJS 11
- Prisma + PostgreSQL
- BullMQ + Redis

## Project Structure

```text
apps/
  api/        NestJS API
  web/        React frontend
packages/
  ai-sdk/     AI provider adapters
  database/   Prisma schema and client exports
  shared/     Shared types/constants
docs/         Planning and design documents
```

## Local Environment

The project expects a root `.env`. A local development file is already present in this repo with these defaults:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/repo_pulse
REDIS_URL=redis://localhost:6379
APP_PORT=3001
FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:3001
```

If you need to recreate it, use `.env.example` as the template.

## Install

If `pnpm` is not installed globally, use Corepack:

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm install
```

Then generate Prisma Client:

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/database db:generate
```

## Build

Package-level builds that were verified locally:

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/shared build
corepack pnpm --filter @repo-pulse/ai-sdk build
corepack pnpm --filter @repo-pulse/database build
corepack pnpm --filter @repo-pulse/api build
corepack pnpm --filter @repo-pulse/web build
```

Notes:

- In this environment, `turbo run build` did not work because `pnpm` was not installed globally and Turbo could not resolve the package-manager binary.
- The backend requires `prisma generate` before TypeScript can resolve Prisma model and enum types.

## Run

### Backend

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/api dev
```

Expected local URLs:

- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/docs`

### Frontend

Development mode:

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/web dev
```

Preview the production build:

```powershell
$env:COREPACK_HOME="$PWD\.corepack"
corepack pnpm --filter @repo-pulse/web preview -- --host 127.0.0.1 --port 4173
```

Default frontend URL:

- `http://localhost:5173`

## Infrastructure Services

The backend is designed to use PostgreSQL and Redis. The repository includes a `docker-compose.yml` for local dependencies:

```powershell
docker compose up -d
```

Services:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Without Redis, the API can still boot and listen on `3001`, but BullMQ will continuously log `ECONNREFUSED` errors.

## OAuth Behavior

GitHub OAuth is optional for local boot now:

- If `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are missing, the API still starts.
- `/auth/github` and `/auth/github/callback` will return a `503` until those variables are configured.

## What Was Verified

Verified in this workspace:

- `packages/shared`, `packages/ai-sdk`, `packages/database` build successfully
- `apps/api` builds successfully
- `apps/web` builds successfully with Vite
- `apps/api` starts and listens on port `3001`
- `apps/web` preview starts successfully

Current machine limitations during verification:

- `docker` is not installed, so PostgreSQL and Redis were not started from `docker-compose.yml`
- local port `6379` was unavailable, so Redis-backed queues reported connection errors

## Troubleshooting

- `pnpm` not found:

  Use `corepack pnpm ...` instead of `pnpm ...`.

- Prisma model types missing from `@repo-pulse/database`:

  Run `corepack pnpm --filter @repo-pulse/database db:generate`.

- API crashes on OAuth startup:

  Ensure you are using the latest code in this repo; the backend now tolerates missing GitHub OAuth env vars during local startup.

- Frontend preview picks another port:

  That means the requested port is already in use. Vite will move to the next available port.
