import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Vitest transpiles with esbuild, which does not implement
    // `emitDecoratorMetadata`. NestJS dependency injection reads exactly that
    // metadata (`design:paramtypes`), so without SWC every constructor
    // injection resolves to `undefined` at runtime and the module fails to
    // build — with an error that points at the wrong thing.
    swc.vite({ module: { type: 'es6' } }),
  ],
  test: {
    // The e2e suite shares one database with the other packages' suites.
    fileParallelism: false,
    setupFiles: ['./src/testing/load-env.ts'],
    // The voucher suite drives real generation runs — several round trips to a
    // hosted database per case — and 30s was clipping the ones that bill three
    // months and then settle them. Slow, but these are the tests that prove the
    // money is right, so they get the time rather than being trimmed.
    testTimeout: 90_000,
    hookTimeout: 120_000,
  },
});
