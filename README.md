# Raman AI

> **A desktop-first, privacy-first local AI workspace.**

Raman AI is an Electron-based local AI system with real desktop execution, local persistence, workspace export, scheduled tasks, council runs, and provider-aware runtime support.
It is the current project and successor to the earlier RamN-AI exploration.

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

Hosted/control-plane AI products often do not preserve dependable local context or provide a private desktop workspace you can trust end to end.
Raman AI exists to keep AI interaction, durable context, and task execution close to the user on their own machine.

## What Raman AI carries forward from RamN-AI (predecessor)

- Specialized-agent orchestration ideas, including Prism-style coordination, are being carried forward in reworked form.
- Provider/model routing abstraction remains a core direction so runtime choices can evolve without changing user workflows.
- Local workspaces and asynchronous workflow patterns continue to inform how tasks and execution are organized.
- Knowledge ingestion concepts (PDF/TXT/DOCX and related local context processing) are retained as practical direction for local-first context.

## Security note

API keys and provider credentials must be supplied through local environment variables or local configuration, and must never be committed to this repository.

## Documentation

- [Architecture](./ARCHITECTURE.md)
- [Handoff](./HANDOFF.md)
