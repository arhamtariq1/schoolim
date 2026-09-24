import { BRAND } from '@ilm/utils';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AuthScrollLock } from './auth-scroll-lock';
import { AuthSlideshow } from './auth-slideshow';

/**
 * Shared frame for every pre-session screen: sign-in, sign-up, OTP, forgot
 * password and new password.
 *
 * ## Layout
 *
 * Desktop is a 50 / 50 split — slideshow on the left, form on the right — so
 * the product is visible before anyone types. The logo sits at the **top-right**
 * of the form column. Below `lg` the slideshow is hidden and the form takes the
 * full width; nobody signs in by scrolling past marketing on a phone.
 *
 * ## Scrolling
 *
 * The document never scrolls (`fixed` frame + `AuthScrollLock`). The only
 * scroller is the form column. Its inner wrapper is `min-h-full` so short forms
 * stay vertically centred, and tall forms (school setup) scroll inside that
 * column alone — never the window.
 */

export interface AuthLayoutProps {
  /** The heading above the form. */
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
  /** The line under the form — "already have an account", and so on. */
  readonly footer?: ReactNode;
  /** A warning or status message above the form. */
  readonly notice?: ReactNode;
  /**
   * Optional control above the form title (e.g. Back during signup OTP).
   * Left-aligned in the form column so it is hard to miss.
   */
  readonly back?: ReactNode;
  /**
   * How much room the form gets.
   *
   * `narrow` is sign-in and password flows. `wide` is sign-up, where
   * docs/16 §5's `max-w-2xl` is enough for two fields on a row.
   */
  readonly width?: 'narrow' | 'wide';
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  notice,
  back,
  width = 'narrow',
}: AuthLayoutProps) {
  return (
    <main className="fixed inset-0 flex overflow-hidden bg-background">
      {/* Applied before paint — do not wait for a client effect, or the
          document scrollbar flashes next to the form column on first load.
          The theme’s global `::-webkit-scrollbar { width: 10px }` still paints
          a trough on `html`/`body` even when overflow is hidden, which is the
          second bar people see beside the form column. */}
      <style>
        {`html,body{overflow:hidden!important;height:100%!important;overscroll-behavior:none;scrollbar-width:none!important}
html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}`}
      </style>
      <AuthScrollLock />

      <div
        aria-hidden="true"
        className="relative hidden h-full w-1/2 shrink-0 overflow-hidden lg:block"
      >
        <AuthSlideshow />
      </div>

      <div className="h-full min-h-0 w-full overflow-y-auto overscroll-y-contain lg:w-1/2">
        <div className="flex min-h-full flex-col px-5 py-8 sm:px-10 sm:py-10">
          <div className="flex shrink-0 justify-end">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Wordmark />
            </Link>
          </div>

          <div className="flex flex-1 flex-col justify-center py-8">
            <div className={`mx-auto w-full ${width === 'wide' ? 'max-w-2xl' : 'max-w-md'}`}>
              {back === undefined ? null : <div className="mb-5">{back}</div>}
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1.5 text-sm text-balance text-muted-foreground">{subtitle}</p>

              {notice === undefined ? null : <div className="mt-5">{notice}</div>}

              <div className="mt-7">{children}</div>

              {footer === undefined ? null : (
                <div className="mt-7 text-center text-sm text-muted-foreground">{footer}</div>
              )}
            </div>
          </div>

          <p className="shrink-0 text-center text-xs text-muted-foreground">
            © {BRAND.name}. Your school’s data stays yours.
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * The mark.
 *
 * Drawn rather than imported: three strokes stepping up — collection over the
 * term. `currentColor` so it follows the primary token without a second asset.
 */
function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6 text-primary" fill="none" aria-hidden="true">
        <path
          d="M4 17.5h3.2V12H4v5.5ZM10.4 17.5h3.2V7.5h-3.2v10ZM16.8 17.5H20V3h-3.2v14.5Z"
          fill="currentColor"
        />
      </svg>
      <span className="text-base font-semibold tracking-tight text-foreground">{BRAND.name}</span>
    </span>
  );
}
