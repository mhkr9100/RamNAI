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
- Work send-to-chat now routes to chatbot thread when `sourceAgentId` exists, otherwise Prism

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
- app-level selected chat target state now controls Chats
- thread reset is available in chatbot and group chats

### Groups

- local group creation in Spectrum
- local group deletion
- Spectrum deep-links directly into group chats

### Settings

- renderer Settings view exists
- provider profiles can be listed and saved through desktop IPC
- Ollama status and default model installation are surfaced in the UI

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
2. Provider profile delete/test and persisted Prism provider override are not finished yet.
3. Group chat uses manual `@mention`, and richer participant management is still intentionally out of scope for this wave.
4. Bundled Ollama runtime management and first-run model installation still need desktop-lane polish.
5. Scheduler timezone handling still needs correction in the desktop lane.

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

### Task 2: Finish provider auth flows and Prism override persistence

Goal:
- finish the backend side for provider profile selection, testing, and persisted Prism override
- keep Ollama as default fallback

Focus files:
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `packages/runtime/src/openclaw-auth.ts`
- `packages/storage/src/sqlite-storage.ts`
- `packages/shared/src/index.ts`

### Task 3: Harden group execution UX and scheduler correctness

Goal:
- keep manual `@mention`
- keep execution and scheduling correct in the desktop lane
- fix timezone-aware next-run computation

Focus files:
- `apps/desktop/src/main.ts`
- `packages/runtime/src/local-runtime.ts`

## Validation Commands

- `npm run typecheck`
- `npm run build`

## Notes

- No mock data
- No fake loading
- No old RamN cloud backend assumptions
- Keep renderer transport-focused
- Keep execution and persistence in desktop/runtime layers
