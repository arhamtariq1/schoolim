import '@/app/globals.css';

import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { sansFont } from '@/lib/fonts';

export const metadata: Metadata = {
  title: `${BRAND.name} — Platform`,
  // The platform console must never be indexed or previewed anywhere.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={sansFont.variable}>
      <body
        className={`${sansFont.className} min-h-dvh bg-background text-foreground antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
