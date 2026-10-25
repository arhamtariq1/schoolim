import { Urbanist } from 'next/font/google';

/**
 * The marketing surface's typeface — ADR-0019.
 *
 * ## One face, not two
 *
 * This page was set in a serif for its headlines and Open Sans for its body,
 * on the reasoning that a claim and a fact should not share a voice. In
 * practice it read as two pages stapled together, and the serif — a printed,
 * institutional voice — fought the soft, friendly surface the page actually
 * wants. Urbanist does both jobs: a geometric sans with a near-circular `o`
 * and a single-storey `a`, which is what reads as approachable rather than
 * corporate, and enough weight range to build a hierarchy without a second
 * family.
 *
 * It is loaded as a **variable** font, so every weight from 100 to 900 is one
 * download. That is what makes a one-family hierarchy cheap: `font-light` for
 * the display line and `font-semibold` for a label cost nothing extra.
 *
 * Unlike the serif it replaces, it is applied to the whole surface rather than
 * to headings alone — `.marketing` sets `font-family` directly in
 * `globals.css`, so body copy, numerals and buttons on this page are all
 * Urbanist and the application's Open Sans is untouched.
 *
 * ## What it costs
 *
 * Latin only, one variable axis, roughly 25KB over the wire. `next/font` scopes
 * the stylesheet to the routes that import it, and the only importer is
 * `app/welcome/page.tsx` — so no screen inside a school downloads this.
 *
 * `display: 'swap'` on purpose: the headline is the first thing worth reading,
 * and reading it in a fallback for 200ms beats not reading it at all.
 */
export const displayFont = Urbanist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-urbanist',
});
