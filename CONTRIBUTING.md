# Contributing to Raman AI

Thanks for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Start development: `npm run desktop:dev`

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run desktop:dev` | Start renderer + Electron in dev mode |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run build` | Build all packages |
| `npm run test` | Run renderer tests |
| `npm run desktop:package` | Package desktop app (unsigned preview) |

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **Ollama** — Install from [ollama.ai](https://ollama.ai) for local model execution

## Project Structure

```
apps/
  desktop/       Electron main process and IPC bridge
  renderer/      React UI (Vite)
packages/
  shared/        Canonical domain types and defaults
  storage/       SQLite persistence layer
  runtime/       Local runtime adapter (Ollama + runtime bridge)
```

## Code Style

- TypeScript strict mode
- No mocked or placeholder data in production paths (see `CRITICAL_RULES.md`)
- Business logic stays in the desktop/runtime layer — renderer handles presentation only
- All domain types live in `@raman-ai/shared`

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run typecheck && npm run build` to ensure no breakage
4. Submit a PR with a clear description of what changed and why

## Reporting Issues

Please open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- OS and Ollama version (if relevant)

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
