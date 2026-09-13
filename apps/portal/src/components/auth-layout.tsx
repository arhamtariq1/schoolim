import { BRAND } from '@ilm/utils';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AuthShowcase } from './auth-showcase';

/**
 * The frame around signing in and signing up.
 *
 * ## Two panels, and only one of them is load-bearing
 *
 * The form is on the left and it is the whole product on this screen: it is
 * first in the DOM, it is what a screen reader reaches first, and it is the
 * only thing that renders below `lg`. The panel on the right is decoration
 * with a job — it says what this is and who it is for, to somebody who has
 * arrived from a link and may not know — and it is `hidden` on a phone rather
 * than stacked above the form, because nobody signs in by scrolling past a
 * marketing panel on a 360px screen.
 *
 * ## Why the art is DOM and not an image
 *
 * The showcase is real markup: real type, real numbers, the same tokens as the
 * rest of the product. A PNG would be a second place the brand colour lives, it
 * would be wrong the day the palette moves, it would be four hundred kilobytes
 * on a 4G connection, and it would be a screenshot of an app rather than the
 * app. This costs nothing to ship and is sharp on any display.
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
   * How much room the form gets.
   *
   * `narrow` is sign-in: two fields, and a 700px-wide pair of boxes looks like
   * a mistake. `wide` is sign-up, where docs/16 §5's `max-w-2xl` is enough to
   * put two fields on a row instead of nine in a column.
   */
  readonly width?: 'narrow' | 'wide';
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  notice,
  width = 'narrow',
}: AuthLayoutProps) {
  return (
    // `h-dvh` with `overflow-hidden`, and the scrolling happens *inside* the
    // form column.
    //
    // The page scrolled as one before, which dragged the art panel up and out
    // of view the moment somebody reached the fourth field — so the half of the
    // screen that is meant to be looked at was the half that left. The panel now
    // stays put and only the form moves, which is also why the form fills the
    // screen rather than sitting in a letterboxed card: on a wide monitor that
    // card was a strip of form floating in a margin.
    <main className="flex h-dvh overflow-hidden bg-background">
      {/* --- The form. Scrolls on its own. --------------------------------- */}
      <div className="flex w-full flex-col overflow-y-auto lg:w-[52%] lg:shrink-0">
        <div className="flex min-h-full w-full flex-col px-5 py-8 sm:px-10 sm:py-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 self-start rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Wordmark />
          </Link>

          <div className="flex flex-1 flex-col justify-center py-8">
            <div className={`mx-auto w-full ${width === 'wide' ? 'max-w-2xl' : 'max-w-md'}`}>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="mt-1.5 text-sm text-balance text-muted-foreground">{subtitle}</p>

              {notice === undefined ? null : <div className="mt-5">{notice}</div>}

              <div className="mt-7">{children}</div>

              {footer === undefined ? null : (
                <div className="mt-7 text-center text-sm text-muted-foreground">{footer}</div>
              )}
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            © {BRAND.name}. Your school’s data stays yours.
          </p>
        </div>
      </div>

      {/* --- The showcase.
              Decoration, so it is hidden from assistive technology rather than
              read out as a wall of stray numbers — and `overflow-hidden` rather
              than scrollable, because it is a picture and a picture does not
              have a second page. --- */}
      <div
        aria-hidden="true"
        className="relative hidden h-full overflow-hidden bg-brand-gradient lg:block lg:flex-1"
      >
        <AuthShowcase />
      </div>
    </main>
  );
}

/**
 * The mark.
 *
 * Drawn rather than imported: three strokes stepping up, which is the only
 * thing this product does for a school — the term's collection, week by week.
 * `currentColor` so it inverts on the gradient panel without a second asset.
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
