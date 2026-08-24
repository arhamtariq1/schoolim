/**
 * Exhaustiveness check for discriminated unions.
 *
 * Adding a variant produces a compile error at every `switch` that must handle
 * it, which is the entire reason docs/12-engineering-rules.md section 1
 * mandates discriminated unions over loose string types.
 */
export function assertNever(value: never, context?: string): never {
  const detail = context === undefined ? '' : ` in ${context}`;
  throw new Error(`Unhandled variant${detail}: ${JSON.stringify(value)}`);
}

/** Narrowing runtime guard for conditions that indicate a programming error. */
export function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invariant violated: ${message}`);
  }
}
