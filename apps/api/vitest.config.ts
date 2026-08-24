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
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
