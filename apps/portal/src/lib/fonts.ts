import { Open_Sans } from 'next/font/google';

/** Product sans — https://fonts.google.com/specimen/Open+Sans */
export const sansFont = Open_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-open-sans',
});
