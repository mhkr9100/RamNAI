# Supreme Raman AI

Desktop-first, privacy-first AI workspace combining RamN AI's product layer with a local execution engine.

## Workspace Layout

- `apps/renderer` — React renderer UI
- `apps/desktop` — Electron shell and IPC bridge
- `packages/shared` — canonical domain types and defaults
- `packages/storage` — local SQLite-backed storage layer
- `packages/runtime` — local runtime adapter for Ollama/OpenClaw integration

## Current Status

This repo already contains a working local foundation:

- Electron shell
- local profile flow
- SQLite persistence
- filesystem workspace export
- local Ollama runtime adapter
- Prism ask and create flows
- scheduled tasks and council runs
- Work surface
- tree-first UserMap editor

OpenClaw vendoring is still pending. The current runtime is real and local, but still Ollama-first.

## Commands

- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm run desktop:dev`
- `npm run desktop:package`

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [HANDOFF.md](./HANDOFF.md)
