# Supreme Raman AI Architecture

## Product Direction

Supreme Raman AI is a new desktop-first product. It is not a continuation of the cloud-first RamN AI stack.

Locked decisions:

- desktop-first
- privacy-first
- local-only at launch
- bring-your-own-model
- Electron shell
- SQLite plus filesystem as the local source of truth
- local profile only: `name` and `email`
- no cloud auth, no AWS backend, no DynamoDB, no Cognito
- Ollama-first local runtime
- optional provider keys later for OpenAI, Anthropic, and Google
- Prism is the product architect
- OpenClaw-style local runtime is the long-term execution target
- no external channels at launch
- Telegram for Prism is phase 2

## Architecture Layers

### 1. Desktop Shell

Implemented with Electron.

Responsibilities:

- app window lifecycle
- IPC bridge
- background scheduler
- desktop notifications
- filesystem access
- SQLite access
- future updater and installer orchestration

Renderer must not own background execution or persistence authority.

### 2. Renderer

React renderer is the human-facing workspace.

Current top-level surfaces:

- Prism
- UserMap
- Spectrum
- Work

Responsibilities:

- capture user intent
- render local state
- submit actions through IPC
- never become the source of truth for tasks, work items, memory, or runtime execution

### 3. Local Storage

The app uses two local stores:

- SQLite for structured state
- filesystem for artifacts, context mirrors, and runtime-accessible files

SQLite currently persists:

- profile
- agents
- groups
- tasks
- work items
- artifacts
- usermap tree
- memory facts
- models

Filesystem workspace currently mirrors:

- `context/profile.json`
- `context/usermap-tree.json`
- `context/memory-facts.json`
- `context/models.json`
- `agents/*.json`
- `tasks/*.json`
- `work/work-items.json`
- `work/artifacts.json`
- generated artifact files under `artifacts/`

### 4. Runtime

Current foundation uses a real local Ollama adapter.

Implemented today:

- runtime availability checks
- local model discovery from Ollama
- Prism ask execution
- Prism create execution
- task execution
- council execution
- durable memory extraction

OpenClaw is not yet vendored. The current adapter is a real local stepping stone, not a mock runtime.

### 5. Scheduler

Task scheduling runs in the Electron main process.

Rules:

- tasks are stored in SQLite
- due tasks are polled from the main process
- execution happens outside React
- task outputs become Work items and optional artifacts
- completed runs can extract memory facts

This replaces the old browser polling and IndexedDB pattern from RamN AI.

## Core Specs

### Agent Spec

Prism creates a persistent local chatbot spec containing:

- identity and metadata
- persona
- provider strategy
- tools and skills
- context scope
- runtime capabilities
- safety policy

OpenClaw-style execution remains the target runtime contract.

### Task Spec

Tasks are scheduled autonomous runs, not chat-thread state.

Supported schedule types:

- one-time
- simple recurring
- cron

Targets in v1:

- Prism
- one individual chatbot

Direct group tasking is out of scope in v1.

### Work Spec

Work is the local record of background execution and results.

Contains:

- tasks
- council runs
- artifacts

Supported actions:

- open
- send to chat
- duplicate
- rerun
- delete

### UserMap Memory Spec

UserMap is tree-first at launch.

It combines:

- manual editable tree
- automatic durable memory extraction
- structured local runtime context

Protected/manual nodes must not be silently overwritten by memory extraction.

## Current Status

What is real now:

- Electron shell
- local profile flow
- SQLite storage
- filesystem workspace export
- local Ollama runtime adapter
- Prism ask and create flows
- task scheduling in main process
- council execution
- Work view for tasks and outputs
- tree-first UserMap editing
- automatic memory extraction path

What is still pending:

- vendored OpenClaw runtime integration
- provider settings UI and non-Ollama providers
- dedicated chatbot chat surface
- manual `@mention` group execution
- bundled Ollama setup and first-run model installer
- Telegram for Prism

## Repository Layout

- `apps/desktop`
  - Electron main/preload process
- `apps/renderer`
  - React UI
- `packages/shared`
  - canonical types and defaults
- `packages/storage`
  - SQLite persistence
- `packages/runtime`
  - local runtime adapter

## Development Flow

Normal development:

- run renderer in dev mode
- run Electron against the local renderer
- use local SQLite and local filesystem workspace

Release flow later:

- build production renderer
- package Electron for macOS and Windows
- later add auto-update

## Reference Sources

These are reference-only, not active implementation bases:

- legacy RamN AI repo
- standalone RamanAI/UserMap repo

Supreme Raman AI should continue as its own repo and architecture.
