import '@/app/globals.css';

// The product name is undecided (D4), so every user-visible string reads from
// one constant and renaming is a single edit. CI greps for violations.
import { ToastProvider } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: BRAND.name,
  description: 'School management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `dir` is set here rather than hard-coded in components so an Urdu tenant
    // flips to RTL without touching one (docs/16 §14).
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/* At the root, not per page: a toast fired while navigating away must
            outlive the page that fired it, or the confirmation of what someone
            just did disappears with the screen they did it on. */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
