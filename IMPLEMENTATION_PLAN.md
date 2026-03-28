# Workspace — Full Implementation Plan

Consolidated roadmap with completion status. Phase numbering follows product direction (ARCHITECTURE.md) plus enterprise rollout (ENTERPRISE_PLAN.md).

---

## Product Phases Overview

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 1** | v1 launch — desktop, local-only, Coordinator, tasks, chats | ✅ Complete |
| **Phase 2** | External channels — Telegram for Coordinator | ✅ Complete |
| **Phase 3** | Agent mode UX, runtime bridge depth | In progress |
| **Phase 4** | Enterprise foundations | Planned |
| **Phase 5** | RBAC, observability, scale | Future |

---

## Phase 1: v1 Launch (Desktop, Local-Only)

Core product for desktop-first, privacy-first, local AI workspace.

### Foundation

- [x] Workspace monorepo
- [x] Electron app shell
- [x] Renderer app (React)
- [x] Shared domain types (`@workspace/shared`)
- [x] SQLite storage layer
- [x] Filesystem workspace export
- [x] Local profile flow (name, email)
- [x] Local Ollama runtime adapter
- [x] First-run model installer (Install default models in onboarding when Ollama available)
- [ ] Bundled Ollama binary (future)
- [ ] Auto-update with code signing

### Coordinator

- [x] Ask mode (runs through Ollama or runtime bridge)
- [x] Create mode (produces structured chatbot spec)
- [x] Created chatbots persist locally
- [x] Created chatbots appear in Directory/Settings
- [x] Coordinator provider override (persisted)
- [x] Coordinator transcript controls (search, role filter, copy, reuse, clear)
- [ ] Telegram for Coordinator (Phase 2)

### Tasks & Work

- [x] Tasks persist in SQLite
- [x] Scheduler in Electron main process
- [x] One-time, simple recurring, cron schedules
- [x] Council runs (local)
- [x] Work items from completed runs
- [x] Artifacts written to disk
- [x] Work send-to-chat routes to chatbot thread when `sourceAgentId` exists
- [x] Work send-to-chat falls back to Coordinator otherwise
- [x] Work search/filter controls
- [x] Scheduler timezone correction (profile timezone for task creation; Settings selector)

### UserMap

- [x] Tree editor
- [x] Protected nodes
- [x] Memory extraction merges durable facts into tree
- [x] UserMap and memory facts mirrored to workspace
- [ ] Import flow (not in v1 scope)

### Chats

- [x] Dedicated Chats surface
- [x] Persistent thread per chatbot
- [x] Persistent thread per group
- [x] Task button beside chatbot chat input
- [x] Thread reset for chatbot and group threads
- [x] Coordinator create opens newly created chatbot chat directly
- [x] Runtime/thread status cues in chat surfaces

### Groups

- [x] Group creation in Directory/Settings
- [x] Group deletion
- [x] Manual `@mention` routing for groups
- [x] Group member handles in Directory and Chats
- [x] Directory deep-links into group chats

### Settings

- [x] Settings view (Local, Accounts, Agents, Coordinator)
- [x] Ollama runtime status visible
- [x] Default model installation from UI
- [x] Provider profiles (OpenAI, Anthropic, Google) list and save
- [x] Provider profile delete
- [x] Provider profile test
- [x] Provider selection per provider
- [x] Coordinator override get/save (persisted)
- [x] Agent mode (ollama / bridge / auto) with Settings UI

### Agent Spin-Off (A1–A6)

- [x] **A1** Add workspace config: `agentMode: 'ollama' | 'bridge' | 'auto'`
- [x] **A2** When `ollama`: bypass runtime bridge; use Ollama only
- [x] **A3** When `bridge`/`auto`: use runtime bridge first, fall back to Ollama
- [x] **A4** Expose `agentMode` in Settings UI with validation
- [x] **A5** Auto-detect best mode on workspace init (bridge if available, else Ollama)
- [x] **A6** Document CLI requirements and health checks for runtime bridge (RUNTIME_BRIDGE.md)

### Packaging

- [x] macOS package (preview + release)
- [x] Windows package (preview + release)
- [x] First-run installer flow (Install default models in onboarding)
- [ ] Update channel configuration

---

## Phase 2: External Channels (Telegram for Coordinator)

*From ARCHITECTURE: "Telegram for Coordinator is phase 2"*

- [ ] Runtime bridge Telegram adapter (external)
- [x] Connect Telegram bot via runtime CLI `channels add` (CLI)
- [ ] Coordinator receives and responds to Telegram messages (runtime bridge gateway)
- [x] UI: channel add flow for Telegram (bot token) in Coordinator Profile
- [x] UI: remove channel button
- [x] RUNTIME_BRIDGE.md: Telegram setup (BotFather, token)
- [ ] (WhatsApp excluded at launch per HANDOFF)
- [ ] (Slack, Discord: future — same pattern as Telegram)

---

## Phase 3: Agent Mode UX & Runtime Bridge Depth

*From ENTERPRISE_PLAN Phase 2*

- [x] Settings UI for agent mode (done in A4)
- [x] Auto-detect agent mode on init
- [x] Document runtime bridge setup (RUNTIME_BRIDGE.md)
- [x] Health checks for runtime bridge availability in status UI
- [ ] Deeper runtime-bridge execution (beyond CLI-first adapter)

---

## Phase 4: Enterprise Foundations

*From ENTERPRISE_PLAN Phase 3 (Weeks 4–6)*

| ID | Deliverable | Status |
|----|-------------|--------|
| E1 | Local-only auth (name + profile) | [x] Done |
| E2 | Optional workspace password / encryption | [ ] |
| E7 | Audit log (agent creation, task runs, profile changes) | [x] Done |
| E8 | Export audit log (JSON/CSV) for compliance | [x] Done |
| E10 | Structured logging (main + renderer) | [x] Done |
| E11 | Health endpoint (Ollama, runtime bridge, storage, scheduler) | [x] Done |

---

## Phase 5: RBAC & Observability

*From ENTERPRISE_PLAN Phase 4 (Weeks 7–10)*

| ID | Deliverable | Status |
|----|-------------|--------|
| E4 | Workspace-level isolation (one workspace = one tenant) | [x] Implicit |
| E5 | Role model: owner, admin, member, viewer | [x] Done |
| E6 | Permissions (create agents, run tasks, edit UserMap, manage settings) | [x] Done |
| E12 | Metrics (task success/fail, latency, model usage) | [x] Done |

---

## Phase 6: Compliance & Scale

*From ENTERPRISE_PLAN Phase 5 (Ongoing)*

| ID | Deliverable | Status |
|----|-------------|--------|
| E8 | Export audit log (JSON/CSV) | [x] Done |
| E9 | Data retention policy hooks | [ ] |
| E13 | SQLite WAL / connection pooling | [ ] |
| E14 | Lazy load (tasks, work, chat history) | [ ] |
| E15 | Background sync workspace ↔ runtime | [x] Partial (scheduler) |

---

## Security & Best Practices

| ID | Deliverable | Status |
|----|-------------|--------|
| E16 | Secrets: never log API keys; use refs only | [x] AuthSecretRef pattern |
| E17 | CSP and IPC allowlists | [x] Done |
| E18 | Auto-update with code signing | [ ] |

---

## Quick Reference: Document Sources

| Document | Content |
|----------|---------|
| ARCHITECTURE.md | Product direction, layers, current status |
| ENTERPRISE_PLAN.md | Agent spin-off, enterprise features, phased rollout |
| HANDOFF.md | What's implemented, what's not, next steps |
| CURSOR_HANDOFF.md | Cursor-specific context |

---

## Summary: What's Done vs Pending

**Done (approx. 85% of Phase 1):**
- Full desktop shell, storage, Coordinator, tasks, chats, groups, UserMap, Settings
- Provider profiles (CRUD, test, selection), Coordinator override, agent mode
- Agent spin-off A1–A4

**Pending (Phase 1):**
- Bundled Ollama / first-run installer
- Scheduler timezone correction
- A5/A6 (auto-detect, docs)

**Phase 2+:** Telegram, enterprise features, RBAC, observability
