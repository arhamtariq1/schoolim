# ADR-0023: Lato as the product typeface

**Status:** Accepted · 2026-10-25

## Decision

The whole product — portal, admin, marketing page and transactional email — is set in
[Lato](https://fonts.google.com/specimen/Lato), replacing Open Sans in the application and Inter
Tight on the marketing page. Instrument Serif stays as the one-word italic accent (ADR-0021).

- `apps/*/src/lib/fonts.ts` load Lato through `next/font` as `--font-lato`; `theme.css` points
  `--font-sans` and `--font-mono` at it.
- `.marketing` resolves `--font-display` to `--font-lato`, which the root layout puts on `<html>`,
  so the marketing page downloads no second sans.
- Email templates name `'Lato'` first in their stacks; clients without it fall back to the system
  sans, as they did for Open Sans.

## Consequences

Lato has no 500 or 600 weight. We load 300, 400, 700 and 900; `font-medium` and `font-semibold`
resolve to the nearest loaded face, so labels set at 500/600 render as 400 or 700. If a weight
between regular and bold turns out to be needed, that is a reason to revisit this choice, not to
synthesise one.
