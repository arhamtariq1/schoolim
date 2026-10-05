import { Noto_Sans } from 'next/font/google';

/** Product sans — https://fonts.google.com/noto/specimen/Noto+Sans */
export const sansFont = Noto_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-noto-sans',
});
