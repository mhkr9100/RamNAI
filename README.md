# Raman AI

> **A desktop-first, privacy-first local AI workspace.**

Raman AI is an Electron-based local AI system with real desktop execution, local persistence, workspace export, scheduled tasks, council runs, and provider-aware runtime support.

## Current foundation

- Electron desktop shell with renderer and IPC bridge
- Local profile flow
- SQLite-backed persistence
- Filesystem workspace export
- Local Ollama runtime adapter
- Ask and create flows
- Scheduled tasks and council runs
- Work surface
- Internal context memory and durable facts

## Repository layout

```text
apps/renderer   React renderer UI
apps/desktop    Electron shell and IPC bridge
packages/shared Canonical domain types and defaults
packages/storage Local SQLite-backed storage
packages/runtime Ollama and runtime-bridge adapters
```

## Runtime direction

The current runtime is real and local, with Ollama as the primary provider. Runtime-bridge vendoring remains a separate follow-up area.

## Commands

```bash
npm install
npm run typecheck
npm run build
npm run desktop:dev
npm run desktop:package
```

## Why it exists

Raman AI explores a private desktop workspace where AI interaction, durable local context, task execution, and personal data remain close to the user instead of requiring a hosted control plane.

## Documentation

- [Architecture](./ARCHITECTURE.md)
- [Handoff](./HANDOFF.md)
