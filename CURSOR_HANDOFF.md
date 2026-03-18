# Cursor Handoff

## Repo

- Workspace: `/Users/hemanthkrmalle/Documents/Entre/Supreme Raman AI`
- Active branch: `codex/supreme-raman-ai`
- Do not touch the old RamN AI repo for implementation work.

## Product Direction

Supreme Raman AI is:

- desktop-first
- privacy-first
- local-only at launch
- Ollama-first
- SQLite + filesystem
- Electron shell
- Prism-driven chatbot creation
- Groups with manual `@mention`
- UserMap tree + automatic memory extraction

## What Is Already Implemented

### Foundation

- Electron shell
- renderer app
- SQLite storage
- filesystem workspace export
- local profile flow
- local Ollama runtime adapter

### Prism

- Ask mode
- Create mode
- created chatbots persist locally

### Work

- scheduled tasks
- council runs
- artifact output
- desktop notifications

### UserMap

- tree editor
- protected nodes
- local memory facts
- memory extraction pipeline

### Chats

- dedicated Chats surface
- persistent chatbot chat threads
- Task button beside chatbot chat input
- group chat threads
- manual `@mention` routing for groups

### Groups

- local group creation in Spectrum
- local group deletion

### OpenClaw adaptation

- OpenClaw-style workspace generator exists in `packages/runtime/src/openclaw-workspace.ts`
- desktop sync now emits OpenClaw-style files into the local workspace mirror

## Files To Know First

- `apps/desktop/src/main.ts`
- `apps/renderer/src/App.tsx`
- `apps/renderer/src/components/ChatsWorkspace.tsx`
- `apps/renderer/src/components/SpectrumView.tsx`
- `apps/renderer/src/components/chat/`
- `packages/runtime/src/local-runtime.ts`
- `packages/runtime/src/openclaw-workspace.ts`
- `packages/storage/src/sqlite-storage.ts`
- `packages/shared/src/index.ts`
- `ARCHITECTURE.md`
- `HANDOFF.md`

## Current Gaps

1. OpenClaw is adapted as a workspace layer, but the live execution path is still Ollama-first through `LocalRuntimeAdapter`.
2. Provider settings UI for OpenAI, Anthropic, and Google is not built yet.
3. Dedicated chatbot chat routing exists, but Spectrum does not yet deep-link into a selected chat.
4. Group chat uses manual `@mention`, but there is no richer participant management yet.
5. Bundled Ollama runtime management and first-run model installation are not implemented yet.

## Best Next Tasks For Cursor

### Task 1: Replace runtime execution path with deeper OpenClaw integration

Goal:
- keep the current UI and storage model
- move actual agent/chat execution toward OpenClaw-native runtime invocation

Focus files:
- `packages/runtime/src/local-runtime.ts`
- `packages/runtime/src/openclaw-workspace.ts`
- possibly new runtime files under `packages/runtime/src/`

Rules:
- do not remove current Ollama working path until replacement is proven
- no cloud dependencies
- keep APIs backward-compatible where possible

### Task 2: Add provider settings and Prism provider override UI

Goal:
- support user-supplied OpenAI / Anthropic / Google keys
- keep Ollama as default

Focus files:
- `apps/renderer/src/App.tsx`
- new settings components under `apps/renderer/src/components/`
- `packages/shared/src/index.ts`
- `packages/storage/src/sqlite-storage.ts`
- `apps/desktop/src/main.ts`

### Task 3: Deep-link Spectrum -> Chats

Goal:
- opening a chatbot or group in Spectrum should navigate into the correct chat thread

Focus files:
- `apps/renderer/src/App.tsx`
- `apps/renderer/src/components/SpectrumView.tsx`
- `apps/renderer/src/components/ChatsWorkspace.tsx`

### Task 4: Improve group execution UX

Goal:
- keep manual `@mention`
- make it easier to route to multiple members
- improve visibility of who replied

Focus files:
- `apps/renderer/src/components/chat/GroupChatView.tsx`
- `apps/desktop/src/main.ts`

## Validation Commands

- `npm run typecheck`
- `npm run build`

## Notes

- No mock data
- No fake loading
- No old RamN cloud backend assumptions
- Keep renderer transport-focused
- Keep execution and persistence in desktop/runtime layers
