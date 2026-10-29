# ADR-0020 — Motion set pieces and labelled product previews on the marketing surface

- Status: Accepted
- Date: 2026-10-26
- Amends: [ADR-0019](0019-marketing-surface-motion.md)

## Context

ADR-0019 gave the landing page Lenis, a display scale and a soft palette, and deliberately kept it
to CSS reveals with no product imagery. The result read as plain rather than premium, and the owner
asked for a full revamp: an all-in-one, "one window" pitch that a school can see rather than only
read about.

Two of ADR-0019's positions stood in the way, and both were put to the owner rather than decided
silently:

1. **Motion** — docs/16 §2 allows `motion/react` "only where CSS genuinely cannot". Scroll-linked
   choreography (a dashboard that stands up as it is scrolled into place, tools that fold into one
   window, a sticky tour) is exactly that case. GSAP and Three.js remain rejected for the reasons
   ADR-0019 gives; the owner chose Lenis + Motion over both.
2. **Product imagery** — ADR-0019 refused "screenshots of invented data". The owner chose product
   previews built from the real UI, clearly labelled as a sample.

## Decision

### 1. `motion` on the marketing surface only

`motion` is a dependency of `@ilm/portal`, imported only by `components/marketing/`. It is used as
`LazyMotion` + `m` with the `domAnimation` feature set, never the full `motion` component, to keep
the route inside the docs/16 §14 budget.

Every motion value is a function of **scroll position**; nothing plays on a timer (ADR-0019 §5 still
holds). Discrete swaps — the tour changing screens — are 250ms in, 150ms out, inside docs/16 §12.

`useMarketingMotion()` gates all of it: scroll-linked styles attach only on the client, after
hydration, when `prefers-reduced-motion` is not set. Until then every set piece renders its finished
layout. This is what keeps hydration exact (the server cannot know the reader's preference) and it
means no-JS and reduced-motion readers get the same complete page.

### 2. Product previews, labelled, from one sample file

Previews live in `components/marketing/marketing-previews.tsx` and are composed from `@ilm/ui`
(`Money`, `StatusBadge`), semantic tokens and the real navigation's labels and icons — not
screenshots, so they cannot show a product we do not have. Every number comes from
`marketing-sample-school.ts`, and every preview area carries `SampleTag` ("Sample school ·
illustrative data"). Previews are `aria-hidden`; the section copy is what a screen reader gets.

Still banned: testimonials, customer logos and usage statistics — anything that reads as proof of
customers we do not yet have.

### 3. Layout values as named rules, not arbitrary classes

Set-piece geometry (the 280vh "one window" track, sticky stage heights, the resting placement of the
old tools, the frame shadow) is declared in the `.marketing`-fenced block of
`apps/portal/src/app/globals.css` as attribute rules and one `--shadow-frame` token — never as
arbitrary Tailwind values (docs/16 §4.8). Inline styles appear only for genuinely computed values:
chart bar heights and widths, per-tool offsets, and Motion's own scroll-linked transforms.

## Consequences

**Good.** The page now argues visually for its one idea — every module behind one login — while
staying honest: every preview is labelled, every claim is checkable in the trial. The motion
degrades to a complete static page with no JavaScript, before hydration and under reduced motion.

**Cost.** Motion adds JavaScript to this one route (~tens of KB gzipped with `domAnimation`), on top
of Lenis. The route budget in docs/16 §14 must be checked in CI as before. A second marketing page
is still the point at which these tokens move into `@ilm/config` (ADR-0019, Consequences).

**Open.** `BRAND.name` is still the placeholder (decision D4, docs/15). The page reads `BRAND` for
every product-name mention, so naming the product updates it in one place.

## Alternatives

- **GSAP + ScrollTrigger** — rejected again, on bundle size; Motion's scroll hooks cover every set
  piece here.
- **Three.js hero** — rejected; a shader behind a school fee page is ornament.
- **Real screenshots** — rejected; they go stale silently and cannot be labelled as a sample in a
  way that survives being cropped and shared.
