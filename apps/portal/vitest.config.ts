import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * jsdom, because the bugs this app has shipped were lifecycle bugs.
 *
 * The portal's tests were pure functions in `lib/` — navigation trees, tenant
 * paths — and every one of them passed while two real defects went out: an edit
 * dialog that never prefilled because its reset hung off a callback React never
 * fires for a controlled dialog, and a print view that reported an empty
 * selection because Strict Mode ran its mount effect twice and the first run
 * consumed the handoff.
 *
 * Neither is reachable from a function test. Both are one render away.
 */
export default defineConfig({
  // The same `@/` the app builds with. Without it a component test resolves
  // its own imports differently from the component it is testing, which is a
  // test of something else.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The app's own JSX transform, so a test file compiles the way the app does.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: false,
  },
});
