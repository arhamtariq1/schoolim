# ADR-0020 — The landing page becomes a full marketing site: product mockups, parallax, a neutral ground

**Status:** Accepted · **Date:** 2026-10-23 · **Amends:** ADR-0019

## Context

ADR-0019 made the landing page type-led and deliberately imageless: _"No image: the alternative was a
mocked-up dashboard full of invented students."_ The brief has since changed. The page is now the
product's marketing site, and it has to explain twelve modules and six role-based portals to a
principal who has never seen school software that works. That is not something prose does well. A
school deciding whether to trust us with its fee collection wants to **see the screen**.

The brief also named the brand (**Lemma**), the primary colour (`#147f8a`, which is already
`brand-600`), a clean neutral background, parallax, and "GSAP or Framer Motion if compatible".

## Decision

### 1. Product mockups are allowed — labelled, built from real components, replaceable

`components/marketing/marketing-mockups.tsx` renders interface previews as **markup**, not images,
built from `@ilm/ui`'s own `Money` and `StatusBadge` on semantic tokens. They follow the theme, stay
crisp at any width, and cost a few KB instead of a few hundred.

ADR-0019's concern was honesty, and it still governs. So:

- Every frame's accessible name ends "(sample data)", and every mockup group carries a visible
  **"Illustration · sample data"** caption.
- Names, schools and figures are plainly sample (`Crescent Grammar School`, `crescent.school`).
- **No testimonials, logos or usage numbers** — unchanged from ADR-0019.

`ProductFrame` and `PhoneFrame` take an optional `screenshot` (a static image import). Passing one
replaces the mockup with no layout change, so real screenshots are a one-prop swap per frame.

### 2. Unbuilt modules say so

The brief lists Assignments and Assets. Neither has a route in the portal today. They are on the page
with a visible **"Coming soon"**, driven by `soon: true` in `marketing-content.ts`. Flip the flag when
they ship.

### 3. Still no GSAP — parallax rides on the existing Lenis loop

GSAP was rejected in ADR-0019 on weight (~70KB) against a PKR 25,000 phone. Nothing in this brief
needs it. Parallax is one more custom property written by `MarketingSmoothScroll` in the frame it
already runs:

- `[data-parallax]` wrappers get `--parallax` (0 → 1 as they cross the viewport).
- `[data-parallax-layer]` children translate by `(--parallax − 0.5) × depth`; the hero's
  `[data-parallax-layer='tilt']` starts tipped back and lies flat by mid-viewport.
- The **wrapper** is measured and the **child** moves, so a transform never feeds back into its own
  measurement.
- At the fallback `0.5` every offset computes to zero, so no-JS, pre-hydration and reduced-motion all
  render the layout as authored. All of it is inside `html[data-marketing-motion='on']`.

Added JS: zero dependencies, a dozen lines.

### 4. A neutral ground and the brand teal as primary

`.marketing` moves from cream to a near-neutral `oklch(0.985 0.003 206)`: under white app chrome, cream
made the screens look yellowed. `--color-primary` moves from `brand-700` to `brand-600` (`#147f8a`)
as the brief asked. White on it measures 4.57:1, above the 4.5:1 line, and every label on it is
medium-weight at 14px or more. The drifting blurred blob is replaced by a static masked hairline grid:
no filter, no loop.

### 5. `BRAND.name` is `Lemma`

The logo, auth screens and sidebar already read Lemma; `BRAND.name` still said `Ilm`. It is now
`Lemma`, which is the one-edit rename `packages/utils/src/product.ts` was designed for. This changes
the name in UI copy, emails and PDF headers product-wide. `legalName` is untouched until the company
is registered (docs/19). If D4 is formally still open, this ADR is the record that the product owner
named it.

### 6. The sticky deck is large-screen only

Each deck panel now carries a screen, and below `lg` text plus screen are taller than the viewport.
With sticky positioning, the next panel would cover the screen before it was seen. Below `64rem` the
panels are a plain column.

## Consequences

- The page now has two kinds of content to keep honest: copy (`marketing-content.ts`) and mockups
  (`marketing-mockups.tsx`). Both are single files.
- Per-frame cost grows by one `getBoundingClientRect` per parallax wrapper. Today that is the hero
  plus the one visible portal panel, because inactive panels are `display: none` and measure as zero.
  If wrappers multiply, move to `animation-timeline: view()`.
- Pricing (decision D2) and the footer phone and city remain placeholders, marked in
  `marketing-content.ts`.
