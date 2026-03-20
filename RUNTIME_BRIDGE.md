# Runtime Bridge Integration

Supreme Raman AI supports an external runtime bridge for Prism, tasks, and multi-channel messaging. When the bridge is available, the app prefers it over direct Ollama; otherwise it falls back to Ollama.

---

## Prerequisites

1. **Runtime CLI** — The runtime command must be installed and on your `PATH` (default: `supreme-runtime`). Override via `SUPREME_RUNTIME_CLI` and `SUPREME_RUNTIME_HOME`.
2. **Ollama** (fallback) — Always required for local execution when the bridge is unavailable or when you select **Ollama only** mode.

---

## Agent Mode (Settings → Local)

| Mode | Behavior |
|------|----------|
| **Auto** | Tries the runtime bridge first; if unavailable, uses Ollama. Resolved at app startup. |
| **Ollama only** | Skips the bridge entirely. Use when the bridge is not installed or you want purely local execution. |
| **Runtime bridge** | Uses the bridge for Prism and task execution. Falls back to Ollama on failure. |

---

## Health Checks

- **Ollama**: App checks `http://127.0.0.1:11434` for availability.
- **Runtime bridge**: App runs the CLI with `--version` to verify it is present.
- **Status UI**: Settings → Local shows runtime status (Local Ready / Models / Accounts).

---

## CLI Requirements

- **Binary**: `supreme-runtime` (or value of `SUPREME_RUNTIME_CLI`)
- **Home**: `~/.supreme-runtime` (or value of `SUPREME_RUNTIME_HOME`)
- **Auth mirror**: `~/.supreme-runtime/auth-profiles.json`, `~/.supreme-runtime/secrets.json`
- **Workspace manifest**: `supreme-runtime.workspace.json` in the workspace root

---

## Channels (Multi-Platform Messaging)

The runtime bridge supports external channels (e.g. Telegram). In **Prism Profile** (sidebar):

- **Add Telegram**: Enter your bot token and click **Connect Telegram**
- **Remove channel**: Click the trash icon next to a channel

### Telegram Setup

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Run `/newbot` and follow the prompts
3. Copy the API token (format: `123456789:ABCdefGHI...`)
4. In Prism Profile → Channels, paste the token and click **Connect Telegram**

### CLI Reference

- **Add channel**: `<cli> channels add --channel telegram --token <bot-token>`
- **List channels**: `<cli> channels list --json`
- **Remove channel**: `<cli> channels remove --channel <id>`
- **Status**: `<cli> channels status --json`

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| "Runtime bridge is not available" | Ensure the CLI is on PATH. Run `<cli> --version`. |
| Mode stuck on Ollama | If you selected Runtime bridge, verify the CLI is reachable. Try **Auto** to let the app detect. |
| Prism / tasks still use Ollama | With **Ollama only**, the bridge is intentionally bypassed. Switch to **Auto** or **Runtime bridge**. |

---

## Reference

- `packages/runtime/src/runtime-bridge.ts` — Prism/task execution via the bridge
- `packages/runtime/src/bridge-agents.ts` — Agents, sessions, channels
- `packages/runtime/src/runtime-compat.ts` — CLI name and paths
