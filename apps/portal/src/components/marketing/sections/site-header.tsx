import { cn } from '@ilm/ui';
import { ICON_SIZE, MenuIcon } from '@ilm/ui/icons';
import Link from 'next/link';

import { LINK, Logo } from './shared';

import { NAV } from '@/components/marketing/marketing-content';

/** The reference's white pill: the light action on the ink header and hero. */
export const LIGHT_PILL =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors duration-200 hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** The bar's action: the teal pill, as on the reference. */
const NAV_PILL =
  'inline-flex min-h-11 sm:min-h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold whitespace-nowrap text-primary-foreground shadow-tile transition-colors duration-200 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * The bar across the top — after the reference the product owner supplied: a
 * light tab hanging from the top of the screen, its lower corners rounded and
 * outlined so it stays distinct over the white page. On it, the logo in its
 * own colours, centred links, a sign-in styled like those links, and one teal
 * pill.
 *
 * Sticky, at the owner's request, and zero-height: the panel overflows a
 * header that takes no room, so the hero runs up behind it at the top and the
 * page's sections pass behind it on scroll. The hero's top padding makes room
 * for it. `marketing-ink` is kept only so the logo's dark-mode chip stays
 * cancelled.
 *
 * `links` lets a page point the bar at its own sections; it defaults to `NAV`.
 */
export function SiteHeader({
  links = NAV,
}: {
  links?: readonly { href: string; label: string }[];
}) {
  return (
    <header className="marketing-ink sticky top-0 z-40 h-0 px-4 sm:px-6 lg:px-8">
      <div className="marketing-paper rounded-b-tile shadow-tile mx-auto max-w-7xl border border-t-0 border-border bg-card">
        <nav
          aria-label="Main"
          className="flex items-center gap-3 px-4 py-2 sm:gap-6 sm:px-6 lg:px-8"
        >
          <Link
            href="#top"
            className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Logo original className="h-7" />
          </Link>

          <ul className="mx-auto hidden items-center gap-8 lg:flex">
            {links.map((item) => (
              <li key={item.href}>
                <a href={item.href} className={cn(LINK, 'text-foreground/80 hover:text-primary')}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="ms-auto flex items-center gap-6 lg:ms-0">
            <Link
              href="/login"
              className={cn(LINK, 'hidden text-foreground/80 hover:text-primary sm:inline-flex')}
            >
              Sign in
            </Link>
            <Link href="/signup" className={NAV_PILL}>
              Start free
            </Link>

            <details data-menu className="group relative lg:hidden">
              <summary
                aria-label="Menu"
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MenuIcon className={ICON_SIZE.nav} aria-hidden />
              </summary>
              <ul className="shadow-tile absolute end-0 top-full mt-2 w-56 rounded-xl border border-border bg-card p-2">
                {links.map((item) => (
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
      </div>
    </header>
  );
}
