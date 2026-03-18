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

### Prism

- Ask mode runs through local Ollama
- Create mode produces a structured local chatbot spec
- created chatbots persist locally and appear in Spectrum

### Tasks and Work

- tasks persist in SQLite
- scheduler runs in Electron main process
- one-time, simple recurring, and cron schedules are supported
- council runs are supported locally
- work items are created from completed runs
- optional artifacts are written to disk

### UserMap

- tree editor exists
- protected nodes exist
- memory extraction can merge durable facts into the tree
- structured UserMap and memory facts are mirrored to the local workspace

## What Is Not Finished Yet

- full OpenClaw vendoring and execution integration
- dedicated chatbot chat sessions
- manual `@mention` group runtime
- provider settings UI for OpenAI, Anthropic, Google
- bundled Ollama setup flow and first-run model download
- Telegram integration for Prism

## Important Architectural Boundaries

- renderer is not the source of truth for scheduled execution
- SQLite and filesystem are authoritative
- scheduler lives in Electron main process
- current local runtime is real but still Ollama-focused
- OpenClaw is the intended next runtime integration layer

## Recommended Next Steps

1. Vendor and adapt OpenClaw runtime into the local execution layer.
2. Add provider settings and Prism provider override support.
3. Build dedicated chatbot chat surfaces with task button near the chat input.
4. Implement manual `@mention` routing for groups.
5. Add bundled Ollama runtime management and first-run model installation.
6. Add packaging polish for macOS and Windows.

## How To Validate The Current Repo

- `npm install`
- `npm run typecheck`
- `npm run build`

If Ollama is running locally, Prism ask/create and scheduled task execution should use the local runtime.
