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
  // Both themes are declared so the browser paints its own chrome — the URL
  // bar on Android, the scrollbar gutter — to match, instead of a white strip
  // above a dark app.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1c1f' },
  ],
};

/**
 * Set the theme class before the first paint.
 *
 * This has to be a blocking inline script. Doing it in an effect means the
 * browser paints light, React hydrates, and *then* the page turns dark — a
 * white flash on every single navigation for anyone using dark mode. There is
 * no React-only way around that, which is why every theming library ships the
 * same three lines.
 *
 * It is wrapped in try/catch because `localStorage` throws outright in some
 * privacy configurations, and a thrown error here would block the whole
 * document.
 */
const NO_FLASH = `
try {
  var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var dark = stored === 'dark' || (stored === null && matchMedia('(prefers-color-scheme: dark)').matches);
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
