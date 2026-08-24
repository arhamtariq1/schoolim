import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The gate and isolation suites need a real PostgreSQL and share one
    // database, so they must not run concurrently against each other.
    fileParallelism: false,
    setupFiles: ['./src/testing/load-env.ts'],
  },
});
