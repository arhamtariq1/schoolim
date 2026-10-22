import '@/app/globals.css';

import { ToastProvider } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { sansFont } from '@/lib/fonts';
import { THEME_STORAGE_KEY, themeChoiceFromStoredValue } from '@/lib/theme-preference';

export const metadata: Metadata = {
  title: `${BRAND.name} — Platform`,
  // The platform console must never be indexed or previewed anywhere.
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The first paint comes from the cookie, so there is no flash of the wrong theme.
  const jar = await cookies();
  const theme = themeChoiceFromStoredValue(jar.get(THEME_STORAGE_KEY)?.value);

  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={[sansFont.variable, theme === 'dark' ? 'dark' : ''].filter(Boolean).join(' ')}
      style={{ colorScheme: theme }}
    >
      <body
        className={`${sansFont.className} min-h-dvh bg-background text-foreground antialiased`}
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
