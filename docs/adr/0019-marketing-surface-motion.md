# ADR-0019 — Lenis, a display scale and a soft palette, on the marketing surface only

**Status:** Accepted · **Date:** 2026-10-21

## Context

docs/16 §2 locks the UI library set and says plainly that adding to it needs an ADR, not a
preference. Two of its rules were written for the application and read as prohibitions on the public
landing page:

- **Motion** is "CSS transitions; Motion (`motion/react`) only where CSS genuinely cannot".
- **Type** is "four type sizes in app chrome": `text-xs` through `text-xl`.

The landing page at the apex is the one screen in this product that is not app chrome. It is read
once, by somebody who has never seen the software, deciding in about eight seconds whether a school
in Pakistan should trust its fee collection to it. `text-xl` is 20px. A headline set at 20px does
not read as a product somebody paid for, and `welcome/page.tsx` said as much in its own docstring:
_"Visual design is deliberately unfinished … the art direction is not, and is expected to be
replaced."_

The instruction was a minimal, premium, award-quality page with smooth scrolling through
[Lenis](https://lenis.darkroom.engineering/) and restrained scroll reveals.

## Decision

**Three additions, each fenced to the marketing surface, and nothing added to the application.**

### 1. `lenis` — one smooth-scroll engine, mounted on one route

`lenis@^1.3` (≈3KB gzipped, no dependencies) is a dependency of `@ilm/portal`. It is imported by
exactly one client component — `components/marketing/marketing-motion.tsx` — which is rendered by
`app/welcome/page.tsx` and nowhere else. No application route pays for it, because no application
route imports it.

It is the **only** smooth-scroll engine. Locomotive Scroll is not installed and must not be: two
engines fighting for the scroll position is the single most common way these pages break.

It is not initialised at all under `prefers-reduced-motion: reduce` — not shortened, not softened,
not initialised. Hijacking the scroll of somebody who has asked the operating system for less motion
is the worst thing on this page to get wrong, because it makes the page unusable rather than
untasteful.

Rejected: **GSAP + ScrollTrigger**, which is the usual pairing and was the first instinct. It is
~70KB for what this page actually needs — "fade and rise when you come into view" — which is one
`IntersectionObserver` and a CSS transition, already allowed by §2 and already how every overlay in
`@ilm/ui` animates. docs/16 §15.6 commits the product to a PKR 25,000 Android phone on 4G; the
marketing page is the first thing that phone downloads, so it is the last place to spend 70KB on
easing curves. Also rejected: **Three.js**, for having nothing to say here. A shader behind a school
fee page is ornament, and the brief asked for the opposite.

### 2. A display type scale — tokens, not arbitrary values

Four fluid `clamp()` sizes (`text-display-xs` … `text-display-lg`, 24px → 88px) and one tracking
token (`tracking-label`) are declared in a `@theme` block in `apps/portal/src/app/globals.css`.

They are **tokens** because §4.8 bans arbitrary Tailwind values and says in the same breath what to
do instead: _"Use the scale or add a token."_ `text-[88px]` would have been the violation; a named
step in the scale is the sanctioned route.

They live in the portal's own stylesheet rather than in `@ilm/config/tailwind/theme.css` on purpose.
The shared theme is the application's design system, and a 88px display size has no business being
reachable from a screen inside a school — "will a second screen need this?" (§1) is answered **no**,
so it does not go in the shared package. The four app chrome sizes are untouched and still the only
sizes any application screen may use.

### 3. A cream ground and four pastel tints, as scoped token overrides

`.marketing` redefines `--color-background`, `--color-card`, `--color-border`, `--color-muted`,
`--color-foreground`, `--color-muted-foreground` and `--color-primary` to a warm, soft palette, with
a matching `.dark .marketing` block. Four tints — `--color-tint-mint`, `-butter`, `-peach`,
`-lavender` — are added as theme tokens so colour can carry structure: four equal things are four
tints rather than four bordered boxes.

It must override `--color-*`, **not** `--bg`. `theme.css` declares `--color-background: var(--bg)`
inside `@theme`, which emits onto `:root`, and a custom property is substituted on the element it is
declared on — so `--color-background` is resolved against the root's `--bg` and inherits downward as
a finished colour. Overriding `--bg` on a descendant arrives far too late. `.dark` escapes this only
because it sits on `<html>`. This cost one build of the page, silently, and **`.parent-portal` in
`theme.css` has the same shape and is very likely inert for the same reason.**

Every pair is measured rather than eyeballed, in both themes: body text on the worst tint is 4.51:1
and on cream 13.0:1, against the 4.5:1 §6 calls a rule. `peach` and `lavender` were each lightened
once after the first pass measured 4.19:1 and 4.06:1 — "it is only a pastel behind a caption" is
exactly the reasoning that ships a contrast failure.

### 4. One typeface: Urbanist, variable, on this surface only

The first version of this page set headlines in a serif and body in Open Sans, on the argument that
a claim and a fact should not share a voice. It read as two pages stapled together, and an
institutional serif actively fought a soft surface. Urbanist — geometric, near-circular `o`,
single-storey `a` — does both jobs, and as a **variable** font every weight from 100 to 900 is one
~25KB download, which is what makes a one-family hierarchy affordable.

It is applied to the whole surface via `font-family` on `.marketing`, not to headings alone. The
application keeps Open Sans; `next/font` scopes the stylesheet to the one route that imports it, so
no screen inside a school downloads it.

### 5. Scroll is the input; almost nothing moves on its own

An earlier cut of this page carried a rotating seal, drifting tiles and a looping phrase band. They
were dropped: three things moving on a timer while the reader is still reading the headline is
decoration competing with content, and none of it was caused by the reader.

What replaced them is motion the reader drives.

**The manifesto (`[data-illuminate]`).** `MarketingSmoothScroll` writes one number — `--read`, 0 to
1 — as the viewport crosses the paragraph. Every word carries an index and CSS does the rest:

```css
opacity: clamp(0.22, calc(var(--read, 1) * var(--word-count) - var(--word-index)), 1);
```

One custom property per frame lights a hundred words, with no per-word observer and no React state
in the scroll path. The `var(--read, 1)` default is the safety story: with no JavaScript, before
hydration, or after the reduced-motion listener removes the property, every word computes to full
opacity. A `@media print` rule pins it to 1 as well, because on paper there is no scroll position
and whatever `--read` held when the dialog opened would otherwise be frozen into the page.

**The deck (`[data-stack-item]`).** Four panels, each `position: sticky` at an offset keyed to its
index, so they gather into a stack with every previous panel's edge still showing. No scroll
listener, no pinning library, nothing to go out of sync — and it degrades to four ordinary stacked
panels wherever sticky is unsupported.

**The nav (`[data-roll-letter]`).** Each character is a one-line window holding two copies of
itself; hover slides the stack by half its height with a per-character delay. The two copies must
each be `display: block` — as inline siblings they lay out side by side and every label renders as
its own letters doubled, which is exactly what the first build did.

Only two things still run on a timer, both inside `html[data-marketing-motion='on'] .marketing`
rather than relying on the global reduced-motion rule: the status dot, and the two blurred colour
fields behind the hero. That gating matters because `theme.css` sets `animation-duration: 0.01ms`,
which does not cancel a loop so much as fast-forward it to its end state. Verified under emulated
`prefers-reduced-motion: reduce`: both report `animation-name: none`, Lenis never starts, nothing is
hidden, and the manifesto's last word measures opacity **1**.

### 6. One documented exception: the status clock

`MarketingStatus` shows Karachi's wall clock, and reads it with a bare `new Date()`, which
`no-restricted-syntax` bans with: _"Use the injected Clock so time is testable and the timezone is
explicit."_

The exception is narrow and disabled on the single line. The rule's first concern is satisfied more
strongly than an injected clock would satisfy it — the zone is a named IANA identifier two lines
below. The second does not apply: this is a wall clock in a client component, the only clock that
exists there is the browser's, and the value is rendered and nothing else. It is never compared,
stored, or used in a decision. **If that stops being true, the exception stops being valid.**

## Consequences

**Good.** The page is ~3KB of JavaScript over a static page, all of it on one route. Reveals are CSS
transitions, so the reduced-motion block already in `theme.css` collapses every one of them to
nothing without a line of JavaScript being asked to co-operate. Content is readable and every
control works with JavaScript disabled — the hidden-until-revealed state is gated behind an
attribute that only a script can set, so no-JS means no hiding. The four app type sizes stayed four.

**The one ongoing cost per frame** is the manifesto's `getBoundingClientRect`, which forces layout.
It is acceptable only because there are one or two such elements; per word it would be a hundred
forced layouts a frame and the slowest thing in the product. A third manifesto is the point at which
this should move to a scroll-driven `animation-timeline` instead.

**The cost.** There is now one page in this repository with its own type scale and its own surfaces,
which is a second system to keep honest. The fence is the `.marketing` class and the
`components/marketing/` folder: anything that reaches outside them has escaped, and review should
treat it as such. A second marketing page (a feature tour, a comparison page) is where this stops
paying for itself and the tokens should move into `@ilm/config`.

**What is still deliberately absent.** No testimonials, no customer logos, no usage numbers, no
screenshots of invented data. The product has no customers to quote yet, and manufactured proof on
the page a school reads before trusting us with its money is a worse failure than a plain page. The
page argues from what the software does, which is checkable, and the honest proof it does carry —
three challan copies across an A4 sheet, paisa-exact money, row-level tenant isolation — is proof
somebody can verify by using it.
