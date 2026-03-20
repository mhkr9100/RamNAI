import { defineConfig } from 'vitest/config';

/** Delegates to workspace packages so `npx vitest run` from repo root uses each app's Vitest config (e.g. jsdom in renderer). */
export default defineConfig({
  test: {
    projects: ['apps/renderer'],
  },
});
