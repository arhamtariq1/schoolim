# ADR-0022 — Landing page rebuilt: paper and ink, after the Awwwards startup references

**Status:** Accepted · **Date:** 2026-10-23 · **Supersedes:** the visual system of ADR-0021 (the
motion, honesty and fencing rules of ADR-0019 and ADR-0020 still apply)

## Context

The product owner reduced the ADR-0021 page to its navigation bar while the design was reconsidered.
They then asked for a full Lemma marketing site with complete content and a pricing plan, citing the
Awwwards "startups" collection and five references: zig.ai, indisea.com, tryclico.com, linusbio.com
and twain.ai.

## Decision

Take the references' **devices**, not their content or assets:

| Device                                       | From                  | Here                                                               |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| Numbered section index `(01) Label`          | indisea, zig          | `SectionHead` on every section                                     |
| Visible container lines                      | indisea, zig          | One framed column (`border-x`) that every section sits in          |
| Before / after rows                          | zig "execution gap"   | "The gap": `PROBLEMS` with ✕ / ✓ columns                           |
| One large thesis statement                   | twain                 | "A parent never sees your software. They see the voucher."         |
| Numbered feature blocks with product screens | zig "built different" | The tour: `SHOWCASE` as `/ 01`–`/ 04`, screens alternating sides   |
| Hub-and-spoke diagram                        | indisea               | `MarketingHub`: one record, six portals                            |
| Logo strip                                   | twain, zig            | A ticker of **module names** — there are no customer logos to show |
| Stat-first numerals                          | twain, zig            | `STATS` — product properties only, never usage figures             |
| Timeline                                     | zig "gets smarter"    | Onboarding: Day 1 → Month 1                                        |
| Pricing cards with a monthly / yearly switch | tryclico              | `MarketingPricing`, plus "every plan" and a feature matrix         |
| Tabbed FAQ                                   | twain                 | `FAQ` in three topics, `<details>` answers                         |
| Pause control on moving content              | linusbio              | Dropped: hover/focus pauses the ticker; reduced motion stops both |

**Palette:** a near-white cool ground, white cards, near-black ink text, teal `#147f8a` as the
single colour; the dark bands (portals, recommended plan, closing call, footer) are a deep
teal-black. Every ratio is measured and noted beside the tokens in `globals.css`; the lowest is
4.57:1.

**Type:** unchanged from ADR-0021 — Inter Tight with one Instrument Serif italic word per headline.

**Still no GSAP.** The ticker and the spokes are CSS keyframes inside the existing
`data-marketing-motion` gate, so they are absent under reduced motion and with no JavaScript.

## Consequences

- **Pricing is shown, and is still the D2 placeholder.** `PACKAGES` now carries an
  `annualPriceMinor` (ten months for twelve, written out, not divided) and a per-plan `href`. The
  warning in `marketing-content.ts` stands: these figures must be confirmed before a real school
  sees them. The plan matrix and "every plan" list describe tiers that are not yet enforced by
  billing.
- `<Money>` hard-codes `text-sm` and `cn()` does not know the marketing display scale, so the plan
  price is sized by a scoped `[data-plan-price]` rule rather than a class.
- `QUESTIONS` became `FAQ` (three topics). `Manifesto`, `LetterRoll` and `MarketingStatus` remain
  unrendered.

## Amendment — the header and hero follow the owner's reference

The product owner then supplied a specific reference for the top of the page (a dark SaaS hero:
white logo, centred links, a white pill; a "What's new?" pill; a left-aligned headline, a white
pill and a text link; the product screen rising out of the band). It is built in the brand's
colours:

- The header is `.marketing-ink` and **opaque**, so it matches the hero at the top and stays
  readable over the light page below without a scroll listener. The logo asset is recoloured white
  there with a CSS filter rather than redrawn.
- The hero's light folds are `.marketing-aurora`: five static gradient layers, all brand-ramp
  steps, ending on `--marketing-ground` (the page's own ground, in both themes) so the band has no
  seam. No canvas, filter or animation.
- The dashboard sits in a frame without browser chrome and fades out through `.marketing-fade-bottom`.
- The ADR-0021 headline accent (one serif word) is not used in the hero, to match the reference;
  the sections below keep it. The proof row and the floating phone left the hero.
- The hero shows the admin dashboard **built in markup** after a screenshot the product owner
  supplied (`AdminDashboardMock` in `marketing-admin-dashboard.tsx`): sidebar, top bar, greeting,
  four counts and the revenue and expenses charts. The two tables are left out. Names and figures
  are sample data, because the screenshot carried a real account's name, email and photo. Its
  motion is CSS only (counters via a registered `@property` integer, SVG lines drawn with
  `pathLength`), inside the reduced-motion gate.
- The hero now shows **the product's real screens**.  copies
  's sidebar and header markup (nav from  for the OWNER role, whose header label
  is "Admin"), and each sidebar destination renders the portal's own view component —
  , ,  and the rest — with props built from
  , typed against . A change to a screen shows up here; a
  change to its data shape fails the build.
- The page area is , so the real buttons cannot open dialogs, push routes or call the API
  from the public page; the sidebar is the only live control.  restores the
  product's own colour tokens and font inside the preview.
- The app is laid out at 1680px and shrunk with CSS  to the frame's width, with a CSS
  default so it does not paint full-size before its script runs.
- Each screen is a  chunk. The dashboard's (with Recharts) loads with the page;
  the others only when chosen. This is the landing page's largest cost and should be checked
  against the 200KB route budget before launch.
-  gained an optional  prop: it is the one screen that fetches its own
  data on mount, and the public page has no session to fetch with.
