import type { ReactNode } from 'react';

import { AuthLogo } from './auth-logo';
import { AuthScrollLock } from './auth-scroll-lock';
import { AuthSideImage } from './auth-side-image';

/**
 * Shared frame for every pre-session screen: sign-in, sign-up, OTP, forgot
 * password and new password.
 *
 * Desktop is a 50 / 50 split — marketing image on the left, form on the right.
 * Below `lg` the image is hidden and the form uses the full width.
 *
 * The document never scrolls (`fixed` frame + `AuthScrollLock`). Tall flows
 * scroll inside the form column; `fitViewport` keeps compact forms (sign-up)
 * within one viewport on desktop without an inner scrollbar.
 */

export interface AuthLayoutProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly notice?: ReactNode;
  readonly back?: ReactNode;
  readonly width?: 'narrow' | 'wide';
  /** Tighter vertical rhythm so the form fits in `100vh` without scrolling. */
  readonly fitViewport?: boolean;
  /** Full logo above the title, centered (sign-up). */
  readonly logoInHero?: boolean;
  /** Less space between title and subtitle. */
  readonly compactTitleBlock?: boolean;
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  notice,
  back,
  width = 'narrow',
  fitViewport = false,
  logoInHero = false,
  compactTitleBlock = false,
}: AuthLayoutProps) {
  const formScrollClass = fitViewport
    ? 'overflow-y-auto overscroll-y-contain lg:overflow-hidden'
    : 'overflow-y-auto overscroll-y-contain';

  const shellPadding = fitViewport
    ? 'px-5 py-5 sm:px-8 sm:py-6 lg:py-5'
    : 'px-5 py-8 sm:px-10 sm:py-10';

  const mainBlockPadding = fitViewport ? 'py-4 lg:py-2' : 'py-8';

  const titleBlockGap =
    fitViewport && compactTitleBlock ? 'mt-4' : fitViewport ? 'mt-5' : 'mt-7';
  const footerGap = fitViewport ? 'mt-5' : 'mt-7';

  return (
    <main className="fixed inset-0 flex overflow-hidden bg-background">
      <style>
        {`html,body{overflow:hidden!important;height:100%!important;overscroll-behavior:none;scrollbar-width:none!important}
html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}`}
      </style>
      <AuthScrollLock />

      <div
        aria-hidden="true"
        className="relative hidden h-full w-1/2 shrink-0 overflow-hidden lg:block"
      >
        <AuthSideImage />
      </div>

      <div className={`h-full min-h-0 w-full ${formScrollClass} lg:w-1/2`}>
        <div className={`flex min-h-full flex-col ${shellPadding}`}>
          {logoInHero ? null : (
            <div className="flex shrink-0 justify-start">
              <AuthLogo />
            </div>
          )}

          <div className={`flex flex-1 flex-col justify-center ${mainBlockPadding} min-h-0`}>
            <div
              className={`mx-auto w-full ${width === 'wide' ? 'max-w-2xl' : 'max-w-md'} ${fitViewport ? 'max-lg:pb-4' : ''}`}
            >
              {logoInHero ? (
                <div className="mb-4 flex justify-center sm:mb-8">
                  <AuthLogo centered />
                </div>
              ) : null}
              {back === undefined ? null : <div className="mb-4">{back}</div>}
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              {subtitle === undefined ? null : (
                <p
                  className={`text-sm text-pretty text-muted-foreground ${compactTitleBlock ? 'mt-0.5' : 'mt-1.5'}`}
                >
                  {subtitle}
                </p>
              )}

              {notice === undefined ? null : <div className="mt-4">{notice}</div>}

              <div className={titleBlockGap}>{children}</div>

              {footer === undefined ? null : (
                <div className={`${footerGap} text-center text-sm text-muted-foreground`}>
                  {footer}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
