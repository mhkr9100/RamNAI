# Supreme Raman AI Handoff

## What This Repo Is

This repo is the new implementation base for Supreme Raman AI, a desktop-first local AI workspace. It replaces the idea of continuing the cloud-first RamN AI codebase for this product direction.

## Locked Product Decisions

- desktop-first
- privacy-first
- local-only at launch
- bring-your-own-model
- Electron shell
- SQLite and filesystem local storage
- no cloud auth at launch
- local profile only: `name` and `email`
- Prism modes:
  - Ask
  - Create
  - Task
  - Council
- chatbots are created only through Prism
- Spectrum is display and management, not manual create
- Groups are manual `@mention` only in v1
- UserMap is tree-first at launch
- no import flow in UserMap at launch
- no external channels at launch
- Telegram for Prism later
- WhatsApp excluded from launch

## What Has Been Implemented

### Foundation

- workspace monorepo
- Electron app shell
- renderer app
- shared domain types
- SQLite storage layer
- filesystem export layer
- local Ollama runtime adapter
- OpenClaw-style auth profile manager
- OpenClaw-style workspace sync
- renderer Settings surface

### Prism

- Ask mode runs through local Ollama
- Create mode produces a structured local chatbot spec
- created chatbots persist locally and appear in Spectrum
- OpenClaw-first execution is attempted before Ollama fallback when the local CLI is available

### Tasks and Work

- tasks persist in SQLite
- scheduler runs in Electron main process
- one-time, simple recurring, and cron schedules are supported
- council runs are supported locally
- work items are created from completed runs
- optional artifacts are written to disk
- Work `Send to Chat` now routes back to the originating chatbot thread when `sourceAgentId` exists; otherwise it injects into Prism

### UserMap

- tree editor exists
- protected nodes exist
- memory extraction can merge durable facts into the tree
- structured UserMap and memory facts are mirrored to the local workspace

### Chats and Spectrum

- dedicated Chats surface exists
- one persistent thread per chatbot or group in this wave
- chatbot chat keeps the Task button beside the input
- thread reset is available in Chats for both chatbot and group threads
- Spectrum deep-links directly into chatbot and group chats
- Prism create now opens the newly created chatbot chat directly
- group chat remains manual `@mention` only
- group member handles are surfaced consistently in Spectrum and Chats
- Work can open the relevant chat destination directly in addition to send-to-chat

### Settings

- renderer Settings view now exists
- local Ollama runtime status is visible
- default local model installation can be triggered from the UI
- provider profiles for OpenAI, Anthropic, and Google can be listed and saved through desktop IPC
- provider secrets are intended to live in local auth files, not SQLite

## What Is Not Finished Yet

- deeper OpenClaw-native execution beyond the current CLI-first adapter
- provider profile delete/test flows
- persisted Prism provider override selection
- bundled Ollama runtime packaging and polished first-run setup flow
- scheduler timezone correction in the desktop lane
- Telegram integration for Prism

## Important Architectural Boundaries

- renderer is not the source of truth for scheduled execution
- SQLite and filesystem are authoritative
- scheduler lives in Electron main process
- renderer talks to desktop IPC only
- current local runtime is real and now OpenClaw-aware, but still keeps the working Ollama path as fallback
- runtime/auth/provider plumbing remains the desktop lane; renderer owns shell integration and UX

## Recommended Next Steps

1. Finish the deeper OpenClaw-native execution path while keeping Ollama fallback safe.
2. Complete provider profile delete/test and persisted Prism provider override support.
3. Fix scheduler timezone handling in the desktop lane.
4. Finish bundled Ollama runtime packaging and first-run install polish.
5. Add packaging polish for macOS and Windows.

## How To Validate The Current Repo

- `npm install`
- `npm run typecheck`
- `npm run build`

If Ollama is running locally, Prism ask/create and scheduled task execution should use the local runtime.
