import { TRIAL_DAYS } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import { ChevronDownIcon, EmailIcon, ICON_SIZE } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';

import { Reveal } from '@/components/marketing/marketing-parts';
import { CONTAINER, LINK, Logo } from '@/components/marketing/sections/shared';

const HEADING = 'tracking-label text-xs font-semibold text-muted-foreground uppercase';
const FOOT_LINK = cn(LINK, 'text-foreground/85');
const FROSTED_PILL =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-4 text-sm text-foreground transition-colors duration-200 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * The foot of the page, on the same primary gradient the hero opens with, so
 * the page ends in the colour it began: the logo, a line about the product
 * and the support address, three columns of links, and the name along the
 * bottom edge in solid white.
 *
 * The wordmark is decorative — the logo above already names the product.
 */
export function LandingFooter({ links }: { links: readonly { href: string; label: string }[] }) {
  return (
    <footer className="marketing-ink marketing-brand overflow-hidden bg-linear-to-br from-brand-600 to-brand-900">
      <div className={cn(CONTAINER, 'pt-16 sm:pt-24')}>
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <Logo />
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
              The all-in-one school management system for Pakistan — admissions, fees, attendance,
              marks, timetables, staff and finance in one place.
            </p>
            <a href={`mailto:${BRAND.supportEmail}`} className={cn(FROSTED_PILL, 'mt-6')}>
              <EmailIcon className={ICON_SIZE.inline} aria-hidden />
              {BRAND.supportEmail}
            </a>
          </Reveal>

          <Reveal index={1} className="lg:col-span-7">
            <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <div>
                <p className={HEADING}>Product</p>
                <ul className="mt-6 space-y-3">
                  {links.map((item) => (
                    <li key={item.href}>
                      <a href={item.href} className={FOOT_LINK}>
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className={HEADING}>Account</p>
                <ul className="mt-6 space-y-3">
                  <li>
                    <Link href="/signup" className={FOOT_LINK}>
                      Start free trial
                    </Link>
                  </li>
                  <li>
                    <Link href="/login" className={FOOT_LINK}>
                      Sign in
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className={HEADING}>Free trial</p>
                <p className="mt-6 text-sm leading-relaxed text-foreground/85">
                  {TRIAL_DAYS} days with everything switched on. No card, no sales call.
                </p>
              </div>
            </nav>
          </Reveal>
        </div>

        <Reveal
          index={2}
          className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-foreground/15 py-6"
        >
          <p className="text-xs text-muted-foreground">
            © {BRAND.name} — school management for Pakistan.
          </p>
          <a href="#top" className={cn(FROSTED_PILL, 'group')}>
            Back to top
            <ChevronDownIcon
              className={cn(
                ICON_SIZE.inline,
                'rotate-180 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5',
              )}
              aria-hidden
            />
          </a>
        </Reveal>
      </div>

      {/* The name rises out of the foot of the band as it comes into view. */}
      <Reveal index={3}>
        <p
          aria-hidden
          className="font-display text-display-2xl text-center font-bold text-foreground select-none"
        >
          {BRAND.name}
        </p>
      </Reveal>
    </footer>
  );
}
