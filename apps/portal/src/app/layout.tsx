import '@/app/globals.css';

// The product name is undecided (D4), so every user-visible string reads from
// one constant and renaming is a single edit. CI greps for violations.
import { ToastProvider } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { THEME_STORAGE_KEY } from '@/components/theme-toggle';

export const metadata: Metadata = {
  title: BRAND.name,
  description: 'School management',
};

export const viewport: Viewport = {
  // One colour, not a pair keyed on `prefers-color-scheme`.
  //
  // The app opens light whatever the device is set to (see NO_FLASH below), so
  // declaring a dark theme colour for a dark-mode device would paint the URL
  // bar to match a theme the page is not using — a dark strip above a light
  // app, which is the very mismatch this field exists to prevent.
  themeColor: '#ffffff',
};

/**
 * Set the theme class before the first paint.
 *
 * ## Light unless somebody chose otherwise
 *
 * The device's `prefers-color-scheme` is deliberately **not** consulted. This
 * is a school's accounts, printed and projected and looked at over somebody's
 * shoulder, and it has one default appearance — the same one on the office
 * desktop as on the laptop a teacher has set to dark at home. Dark mode is a
 * choice a person makes here, not one their operating system makes for them,
 * so the only thing that turns it on is having pressed the switch.
 *
 * Which is why the condition is `stored === 'dark'` and nothing more: no
 * stored value means light, permanently, rather than "ask the OS".
 *
 * ## Why it is a blocking inline script
 *
 * Doing it in an effect means the browser paints light, React hydrates, and
 * *then* the page turns dark — a white flash on every navigation for anyone
 * who has chosen dark. There is no React-only way around that, which is why
 * every theming library ships the same three lines.
 *
 * It is wrapped in try/catch because `localStorage` throws outright in some
 * privacy configurations, and a thrown error here would block the whole
 * document.
 */
const NO_FLASH = `
try {
  var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var dark = stored === 'dark';
  if (dark) document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `dir` is set here rather than hard-coded in components so an Urdu tenant
    // flips to RTL without touching one (docs/16 §14).
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/* At the root, not per page: a toast fired while navigating away must
            outlive the page that fired it, or the confirmation of what someone
            just did disappears with the screen they did it on. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
