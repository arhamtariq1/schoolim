import { Lato } from 'next/font/google';

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
