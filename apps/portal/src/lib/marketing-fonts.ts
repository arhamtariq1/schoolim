import { Instrument_Serif } from 'next/font/google';

/**
 * The marketing surface's accent typeface — ADR-0021, ADR-0023.
 *
 * ## The product's sans, a serif for one word
 *
 * The page is set in Lato, the same face as the application, loaded once by
 * the root layout (`lib/fonts.ts`) — `.marketing` points `--font-display` at it.
 *
 * Instrument Serif appears only as an italic accent — one word per headline,
 * marked `*like this*` in a `WordReveal`'s text. Spread across whole
 * paragraphs it would stop being an accent.
 *
 * ## What it costs
 *
 * Latin only, one italic weight. `next/font` scopes it to the only importer,
 * `app/welcome/page.tsx`, so no screen inside a school downloads it.
 */
export const accentFont = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: 'italic',
  display: 'swap',
  variable: '--font-marketing-serif',
});
