import { DM_Sans, Lato } from 'next/font/google';

/**
 * Product sans — https://fonts.google.com/specimen/Lato
 *
 * Lato ships 100, 300, 400, 700 and 900 only. `font-medium` and `font-semibold`
 * (500, 600) have no face of their own and resolve to the nearest loaded one.
 */
export const sansFont = Lato({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '700', '900'],
  display: 'swap',
  variable: '--font-lato',
});

/**
 * The landing page's face, chosen by the product owner —
 * https://fonts.google.com/specimen/DM+Sans
 *
 * A variable font, so every weight from 100 to 1000 comes from one file and
 * `font-medium`/`font-semibold` get real faces. Used on the landing page only,
 * through `.marketing` in globals.css — the product's screens, including the
 * preview inside the hero, keep Lato. To swap it, change this one import.
 */
export const brandFont = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-brand',
});
