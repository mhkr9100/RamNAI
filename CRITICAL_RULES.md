# Critical Rules — Workspace

These rules are non-negotiable for production code.

## 1. DO NOT simulate, mock, or hardcode ANY responses

- **API/Data layer**: All data must come from real storage (SQLite, IPC, runtime) or real external services.
- **Renderer**: Never return fabricated data when a fetch fails. Show error state; do not fall back to fake success.
- **Tests**: Unit tests may use mocks for isolation. That is acceptable. Production paths must never use mocks.

## 2. DO NOT use setTimeout to fake loading

- **Prohibited**: `setTimeout` used to simulate async work, fake delays, or pretend something is loading.
- **Allowed**: `setTimeout` for UX only:
  - Copy-to-clipboard feedback reset (e.g. "Copied" → clear after 2s)
  - Tooltip show/hide delay
  - Toast auto-dismiss
  - Debounce/throttle for input

## 3. DO NOT return example/dummy/placeholder data

- Never return sample payloads when an API fails.
- Empty arrays `[]` or `null` on failure are acceptable; not fake success data.
- No "Lorem ipsum" or hardcoded demo content in production paths.

## 8. DO NOT put business logic in frontend code

- **Renderer**: Handles presentation, user input capture, and calling IPC/API. No domain rules, validation rules, or ID generation.
- **Backend/Desktop**: All validation, slugification, ID generation, normalization, and business rules.
- **Exceptions**: Pure display transforms (e.g. format date for UI) and filter/sort for display are OK in renderer.

## 10. Test every function with real data before moving on

- New or changed code must be exercised with real data flows.
- Avoid shipping untested paths.

---

*Reference: CRITICAL_RULES in project standards.*
