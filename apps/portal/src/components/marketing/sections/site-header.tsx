import { cn } from '@ilm/ui';
import { ICON_SIZE, MenuIcon } from '@ilm/ui/icons';
import Link from 'next/link';

import { LINK, Logo } from './shared';

import { NAV } from '@/components/marketing/marketing-content';

/** The reference's white pill: the light action on the ink header and hero. */
export const LIGHT_PILL =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors duration-200 hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * The bar across the top — after the reference the product owner supplied:
 * a white logo, centred links and one white pill, sitting on the same ink as
 * the hero so the two read as one dark band at the top of the page.
 *
 * It stays ink once the page scrolls past the hero. A bar that turns light
 * part-way down would need a scroll listener to decide when; one that is
 * always the colour of the hero needs nothing, and dark-on-light is the
 * contrast every reader already expects of a sticky bar.
 */
export function SiteHeader() {
  return (
    <header className="marketing-ink sticky top-0 z-40 bg-background">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-4 sm:px-6 lg:px-12"
      >
        <Link
          href="#top"
          className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Logo />
        </Link>

        <ul className="mx-auto hidden items-center gap-8 lg:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={cn(LINK, 'text-foreground/85')}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ms-auto flex items-center gap-4 lg:ms-0">
          <Link href="/login" className={cn(LINK, 'hidden text-foreground/85 sm:inline-flex')}>
            Sign in
          </Link>
          <Link href="/signup" className={cn(LIGHT_PILL, 'whitespace-nowrap')}>
            Start free
          </Link>

          <details data-menu className="group relative lg:hidden">
            <summary
              aria-label="Menu"
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <MenuIcon className={ICON_SIZE.nav} aria-hidden />
            </summary>
            <ul className="shadow-tile absolute end-0 top-full mt-2 w-56 rounded-xl border border-border bg-card p-2">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="mt-1 border-t border-border pt-1">
                <Link
                  href="/login"
                  className="flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </details>
        </div>
      </nav>
    </header>
  );
}
