# Enterprise-Grade Implementation Plan — Workspace

This plan outlines the path to an enterprise-ready platform with support for agent spin-off **with** and **without** the runtime bridge. It aligns with [CRITICAL_RULES.md](./CRITICAL_RULES.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Agent Spin-Off Modes

### 1.1 Current Architecture

- **Ollama-only**: Direct calls to local Ollama; no external runtime.
- **Runtime bridge**: External CLI used for Coordinator prompts, agents, sessions, channels.
- **LocalRuntimeAdapter** routes Coordinator/task execution: runtime bridge first when available, else Ollama.

### 1.2 Spin-Off Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Ollama-only** | Agents run via local Ollama; no runtime bridge dependency. | Standalone desktop; air-gapped; minimal setup. |
| **Runtime bridge** | Agents run via the bridge gateway (sessions, channels, routing). | Multi-agent, Telegram, streaming, richer orchestration. |

### 1.3 Implementation Tasks: Agent Spin-Off

| Task | Description | Priority |
|------|-------------|----------|
| **A1** | Add workspace config flag: `agentMode: 'ollama' | 'bridge'` | P1 |
| **A2** | When `ollama`: bypass runtime bridge for Coordinator/tasks; use `LocalRuntimeAdapter` Ollama path only | P1 |
| **A3** | When `bridge`: require runtime bridge availability; use RuntimeBridge and BridgeAgentManager | P1 |
| **A4** | Expose `agentMode` in Settings UI with validation (e.g. warn if bridge selected but CLI unavailable) | P2 |
| **A5** | On workspace init, auto-detect best mode: bridge if available, else Ollama | P2 |
| **A6** | Document CLI requirements and health checks for runtime bridge mode | P2 |

### 1.4 Data Flow Summary

```
User Intent → Workspace Config (agentMode) → LocalRuntimeAdapter
                                                    ├── bridge: RuntimeBridge / BridgeAgentManager
                                                    └── ollama: Direct Ollama API
```

---

## 2. Enterprise-Grade Platform Improvements

### 2.1 Authentication & Access Control

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **E1** | Keep local-only auth (name + profile) for desktop-first v1 | No cloud auth at launch |
| **E2** | Add optional workspace password / encryption key (user-controlled) | Protects SQLite and workspace files |
| **E3** | Optional enterprise SSO (OIDC/SAML) for future cloud/team mode | Out of scope for v1 |

### 2.2 Multi-Tenancy & RBAC (Future)

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **E4** | Workspace-level isolation: one workspace = one tenant | Maps to one SQLite DB + one workspace dir |
| **E5** | Role model: `owner`, `admin`, `member`, `viewer` | Backend-only; no UI in v1 |
| **E6** | Permissions: create agents, run tasks, edit UserMap, manage settings | Enforced in main process and storage layer |

### 2.3 Audit & Compliance

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **E7** | Audit log: agent creation, task runs, profile changes, model usage | Append-only table in SQLite |
| **E8** | Export audit log (JSON/CSV) for compliance | Admin/owner only |
| **E9** | Data retention policy hooks (configurable retention window) | Optional |

### 2.4 Observability & Reliability

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **E10** | Structured logging (main + renderer) with log levels | No PII in logs by default |
| **E11** | Health endpoint: Ollama, runtime bridge, storage, scheduler | Used by status UI and diagnostics |
| **E12** | Metrics: task success/fail rate, latency percentiles, model usage | Local aggregation only; no telemetry without consent |

### 2.5 Scalability & Performance

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **E13** | SQLite connection pooling / WAL mode | Ensure concurrent read/write safety |
| **E14** | Lazy load large datasets (tasks, work items, chat history) | Pagination in renderer |
| **E15** | Background sync: workspace ↔ runtime without blocking UI | Already partially done via scheduler |

### 2.6 Security Hardening

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **E16** | Secrets: never log or expose API keys; use refs only | Align with `AuthSecretRef` |
| **E17** | Content Security Policy and IPC allowlists | Electron security best practices |
| **E18** | Auto-update with code signing | Post-launch |

---

## 3. Phased Rollout

### Phase 1: Agent Spin-Off (Weeks 1–2)

- Implement **A1–A3**: `agentMode` config and routing.
- Test both modes with real Coordinator create/ask and task execution.
- No mock or placeholder responses (per CRITICAL_RULES).

### Phase 2: Agent Mode UX (Weeks 2–3)

- **A4–A6**: Settings UI, auto-detect, documentation.
- Health checks for runtime bridge availability.

### Phase 3: Enterprise Foundations (Weeks 4–6)

- **E2**, **E7**, **E10**, **E11**: Workspace encryption option, audit log, structured logging, health.
- Backend-only changes; no business logic in frontend.

### Phase 4: RBAC & Observability (Weeks 7–10)

- **E4–E6**, **E12**: Tenant isolation, role model, metrics.
- Deferred if desktop-only remains the focus.

### Phase 5: Compliance & Scale (Ongoing)

- **E8**, **E9**, **E13–E15**: Audit export, retention, SQLite tuning, lazy loading.
- Driven by customer requirements.

---

## 4. CRITICAL_RULES Alignment

- **Rule 1**: No simulated/mocked responses — all agent execution uses real Ollama or the runtime bridge.
- **Rule 2**: No `setTimeout` for fake loading — use real async status and health checks.
- **Rule 3**: No placeholder data — empty/error states when data is missing.
- **Rule 8**: Business logic in backend/main process — frontend only presents and triggers IPC.
- **Rule 10**: Test every function with real data — agent spin-off must be validated end-to-end.

---

## 5. Quick Reference: Key Files

| Area | File(s) |
|------|---------|
| Agent mode routing | `packages/runtime/src/local-runtime.ts` |
| Runtime bridge integration | `packages/runtime/src/runtime-bridge.ts`, `bridge-agents.ts` |
| Runtime compat | `packages/runtime/src/runtime-compat.ts` |
| Workspace config | `packages/shared`, storage schema |
| Settings UI | `apps/renderer/src/components/SettingsView.tsx` |
| IPC / main | `apps/desktop/src/main.ts` |

---

## 6. Success Criteria

- [ ] Agent spin-off works in both `ollama` and `bridge` modes.
- [ ] No hardcoded or mocked responses in production paths.
- [ ] Audit log captures critical actions.
- [ ] Health checks reflect real runtime and storage status.
- [ ] Documentation explains mode selection and runtime bridge setup.
