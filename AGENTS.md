# Codex Web (Contributor Notes)

## Core behaviors
1. After code changes, run `npm run build` so server/client bundles stay in sync.
2. Do not commit secrets. Keep `.env` ignored and keep `.env.example` up to date.

## Project shape
- `src/server/*`: Express relay that wraps the `codex` CLI and exposes REST + streaming endpoints.
- `src/client/*`: Vite + React PWA UI (Workspace + terminal).
