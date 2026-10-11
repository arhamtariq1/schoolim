import '@/app/globals.css';

// The product name is undecided (D4), so every user-visible string reads from
// one constant and renaming is a single edit. CI greps for violations.
import { ToastProvider } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { DashboardChrome } from '@/components/dashboard-chrome';
import { readThemeChoiceFromCookie, type ThemeChoice } from '@/lib/theme-preference';
import { sansFont } from '@/lib/fonts';

export const metadata: Metadata = {
  title: BRAND.name,
  description: 'School management',
};

export const viewport: Viewport = {
  // One colour, not a pair keyed on `prefers-color-scheme`.
  //
  // The app opens light whatever the device is set to (see theme cookie below), so
  // declaring a dark theme colour for a dark-mode device would paint the URL
  // bar to match a theme the page is not using — a dark strip above a light
  // app, which is the very mismatch this field exists to prevent.
  themeColor: '#ffffff',
};

function htmlThemeAttrs(choice: ThemeChoice): { className: string; colorScheme: 'light' | 'dark' } {
  return {
    className: choice === 'dark' ? 'dark' : '',
    colorScheme: choice,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const theme = readThemeChoiceFromCookie(jar);
  const { className: themeClass, colorScheme } = htmlThemeAttrs(theme);

  return (
    // `dir` is set here rather than hard-coded in components so an Urdu tenant
    // flips to RTL without touching one (docs/16 §14).
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={[sansFont.variable, themeClass].filter(Boolean).join(' ')}
      style={{ colorScheme }}
    >
      {/*
        No `min-h-dvh` here, on purpose.

        It was doing nothing that `bg-background` was not already doing — CSS
        propagates the body's background to the canvas, so the viewport is
        painted whatever the body's height — and it was doing one thing that
        hurt: forcing the body to a full `100dvh` even on screens whose own
        chrome is `position: fixed`. The moment anything shaved a pixel off the
        available height (a horizontal scrollbar is enough on Windows), a body
        pinned to exactly one viewport overflowed it, and the app grew a second
        scrollbar that scrolled the sidebar and header out of view.

        Without it the body is as tall as whatever is actually in flow, so the
        document scrolls only when a page genuinely has more than fits.
      */}
      <body className={`${sansFont.className} bg-background text-foreground antialiased`}>
        {/* At the root, not per page: a toast fired while navigating away must
            outlive the page that fired it, or the confirmation of what someone
            just did disappears with the screen they did it on. */}
        <ToastProvider>
          <DashboardChrome>{children}</DashboardChrome>
        </ToastProvider>
      </body>
    </html>
  );
}
