/**
 * `jose` is ESM-only, and the API compiles to CommonJS because NestJS depends
 * on legacy decorators and `emitDecoratorMetadata` (docs/05, the TypeScript
 * version note).
 *
 * A static `import` would therefore become a `require` and fail at runtime.
 * TypeScript's Node16 module mode preserves dynamic `import()` in a CommonJS
 * file for exactly this case, so the module is loaded once, lazily, and cached.
 *
 * The cost is that token operations are async — which they already were.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, @typescript-eslint/no-unsafe-assignment -- an import() type is the only way to reference an ESM-only module's types from a CommonJS file; a static type import would emit a require.
type Jose = typeof import('jose', { with: { 'resolution-mode': 'import' } });

let cached: Promise<Jose> | undefined;

export function loadJose(): Promise<Jose> {
  cached ??= import('jose');
  return cached;
}
