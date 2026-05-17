# Repo Pulse Electron Desktop

The Electron workspace wraps the existing Vite web app as a desktop shell while keeping the web app available as a normal browser app.

## Development

```bash
pnpm dev:electron
```

This starts:

- `@repo-pulse/api` on `127.0.0.1:3001`
- `@repo-pulse/web` on `127.0.0.1:5173`
- Electron loading the Vite dev server

The API still needs the same local services and environment variables as the web app, especially `DATABASE_URL`, `JWT_SECRET`, and Redis if queues are enabled.

Desktop sign-in does not use the browser OAuth redirect flow. Add a GitHub token to the root `.env`:

```bash
GITHUB_TOKEN=github_pat_xxx
```

The token should be able to read the account and repositories you want Repo Pulse to monitor. For classic tokens, use `repo` for private repositories. For fine-grained tokens, grant repository metadata/content access for the selected repositories.

If Electron reports `Electron failed to install correctly`, the npm package was installed but the platform binary was not downloaded. Run:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm --filter @repo-pulse/electron install:electron
```

## Build

```bash
pnpm build:electron
```

This compiles Electron main/preload code and builds the web app with desktop-friendly asset paths.

## Package

```bash
pnpm package:electron
```

This runs the Electron build and then uses `electron-builder`. The packaged app includes the compiled web assets under Electron resources and loads them through the desktop shell.

## Runtime API

The desktop renderer defaults API calls to `http://127.0.0.1:3001`. Override this with:

```bash
VITE_API_BASE_URL=http://127.0.0.1:3001 pnpm dev:electron
```
