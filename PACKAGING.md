## Raman AI Packaging Plan (desktop-only)

This repo defaults to **unsigned preview builds** for local development.

### Current commands

Preview paths:

- `npm run desktop:package`
- `npm run desktop:package:mac:preview`
- `npm run desktop:package:win:preview`

Release-oriented paths:

- `npm run desktop:package:mac:release`
- `npm run desktop:package:win:release`

Release scripts are **env-gated**. They fail fast if signing/notarization variables are missing instead of silently degrading to unsigned output.

### Icon pipeline (no binary assets committed)

This repo keeps the **source-of-truth icon as SVG**:

- `apps/desktop/assets/icon.svg`

Release packaging for macOS/Windows requires platform icon formats:

- **macOS**: `.icns`
- **Windows**: `.ico`

Recommended approach:

- Generate `.png` sizes from the SVG during release CI (or locally) and then build `.icns`/`.ico`.
- Commit only the SVG; publish artifacts can embed the generated icons.

Suggested tooling:

- macOS `.icns`: `iconutil` (folder of PNGs) or a build-step tool of your choice
- Windows `.ico`: `png2ico` or `icotool` (from `icoutils`)

### macOS signing + notarization (production path)

Goal: ship a signed + notarized app.

Prereqs:

- Apple Developer ID Application certificate installed in Keychain
- App-specific password / notarization credentials

electron-builder settings to add when ready:

- `build.mac.hardenedRuntime = true`
- `build.mac.entitlements` + `entitlementsInherit`
- `build.afterSign` hook to notarize (or electron-builder notarize config)
- `build.publish` configured for your chosen update channel (see updater notes)

Runbook:

1. Produce a signed `dmg` (or `zip`) artifact
2. Notarize
3. Staple
4. Verify with `spctl` and `codesign --verify`

### Windows x64 plan

Goal: ship `win-x64` installer(s) and portable build.

Recommended electron-builder targets:

- `nsis` (installer)
- `zip` (portable)

Signing:

- Use a code-sign cert (EV preferred for reputation) via `signtool` integration.

CI:

- Build on Windows runners for deterministic packaging.

### Updater groundwork (no cloud dependency at launch)

You can keep launch **offline-first** and still prepare the update layer:

- Decide update transport (GitHub Releases, S3-compatible bucket, or local enterprise feed).
- Wire auto-updater only when you have a stable feed.

Suggested staged approach:

1. Keep `electron-builder` packaging in place (already working).
2. Add an “update channel” config (disabled by default).
3. Enable updater only when publishing infra exists.

### First-run Ollama flow polish (desktop)

Current primitives:

- IPC `ollama:status` exposes runtime reachability + per-model progress/phase/error
- IPC `ollama:installDefaults` performs real `ollama pull` for recommended models

Recommended next polish steps (still desktop-only):

- Add a desktop-side “firstRunComplete” flag in SQLite (non-secret) and trigger default model install only once.
- Surface actionable error messages when:
  - `ollama` binary is missing
  - the daemon is not running
  - pulls fail due to disk/network constraints
