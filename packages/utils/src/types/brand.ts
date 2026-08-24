/**
 * Nominal typing helper.
 *
 * Two structurally identical types become incompatible, so passing a section id
 * where a student id is expected fails to compile rather than failing in
 * production. See docs/12-engineering-rules.md section 1.
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };
