# Raman AI

Desktop-first, privacy-first local AI system with real desktop execution, local storage, and provider-aware runtime fallback.

## Repo Layout

- `apps/renderer` — React renderer UI
- `apps/desktop` — Electron shell and IPC bridge
- `packages/shared` — canonical domain types and defaults
- `packages/storage` — local SQLite-backed storage layer
- `packages/runtime` — local runtime adapter for Ollama and runtime-bridge integration

## Current Status

This repo already contains a working local foundation:

- Electron shell
- local profile flow
- SQLite persistence
- filesystem workspace export
- local Ollama runtime adapter
- Raman AI ask and create flows
- scheduled tasks and council runs
- Work surface
- internal context memory and durable facts

Runtime-bridge vendoring is still pending. The current runtime is real and local, but still Ollama-first.

## Commands

- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm run desktop:dev`
- `npm run desktop:package`

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [HANDOFF.md](./HANDOFF.md)
