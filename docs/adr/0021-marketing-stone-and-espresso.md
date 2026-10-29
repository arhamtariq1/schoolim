# ADR-0021 — Landing page art direction: stone and espresso

**Status:** Accepted · **Date:** 2026-10-23 · **Supersedes:** the visual system of ADR-0019 and
ADR-0020 (their motion, honesty and fencing rules still apply)

## Context

The product owner did not like the ADR-0020 page and named an Awwwards-recognised reference,
fitosauna.com, asking for a clearly different and better UI.

## Decision

Take the reference's **qualities**, not its content or assets:

- **Palette:** warm stone ground, greige panels (`muted`), espresso text and dark bands. Brand teal
  `#147f8a` is kept as a signal only: the primary action, numerals, icons. All of it is declared as
  semantic tokens in `.marketing` / `.marketing-ink` / `.marketing-paper`, and ratios are noted beside
  each block.
- **Type:** Inter Tight (variable grotesk) at very large sizes (`text-display-xl`,
  `text-display-2xl`), with **one** Instrument Serif italic word per headline, marked `*word*` in
  `WordReveal`. Urbanist is retired from this page.
- **Composition:** dark panels inset from the viewport edge with large radii, numbered everything
  (`(01)`, `01 / 05`), outlined pill controls, product screens cropped by their panel's edge.
- **New sections, after the reference:** a numbered scroll-snap carousel
  (`marketing-carousel.tsx`, native scrolling and a tiny client island), a three-column comparison
  against paper registers and spreadsheets (never a named competitor), and a numbered tile grid.
- **Still no GSAP.** Native scroll-snap, the existing Lenis loop and CSS cover everything here.

`.marketing-paper` exists so a light product screen can sit inside a dark band. It re-declares the
light tokens **and** resets `color`. Tokens alone are not enough, because `color` is inherited as an
already-computed value from the ink ancestor; the first build shipped invisible figures in the
portal previews because of exactly that.

## Consequences

- The ADR-0020 sticky deck, manifesto and hairline feature lattice are gone from the page. Their
  components still exist and nothing renders them.
- Two web fonts on this route instead of one (about 25KB more), still scoped to `/welcome` only.
