import { cn } from '@ilm/ui';
import { ForwardIcon, ICON_SIZE } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';

import { LIGHT_PILL } from './site-header';

import { AdminDashboardMock } from '@/components/marketing/marketing-admin-dashboard';
import { Rise } from '@/components/marketing/marketing-parts';

/**
 * The product owner's reference, in the brand's colours: a dark band lit by
 * soft vertical folds of teal that brighten toward the bottom, a "what's new"
 * pill, a left-aligned headline, one white pill and a text link — and the
 * product itself rising out of the band, fading into the page below.
 *
 * The glow at the foot of the band ends on `brand-50`, which is within a hair
 * of the page's own ground, so the dark hero hands over to the light page
 * without a seam. All of it is one static background (`.marketing-aurora` in
 * `globals.css`): no canvas, no filter, no loop.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="marketing-ink marketing-aurora relative overflow-hidden bg-background"
    >
      <div className="relative mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-24 lg:px-12">
        <Rise>
          <a
            href="#capabilities"
            className="inline-flex min-h-11 items-center gap-3 rounded-full border border-foreground/15 bg-foreground/5 py-1 ps-1 pe-4 text-sm text-foreground/85 transition-colors duration-200 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
              <span aria-hidden className="size-2 rounded-full bg-primary" />
              What’s new?
            </span>
            Six portals, one school record
            <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
          </a>
        </Rise>

        {/* A plain heading on the CSS load animation, not a `WordReveal`: the
            hero's headline must never wait on the reveal observer, which is
            how it went missing in the owner's browser. */}
        <Rise>
          <h1
            id="hero-title"
            className="font-display text-display-lg mt-8 max-w-4xl font-medium text-balance"
          >
            Run your whole school. Grow it with {BRAND.name}.
          </h1>
        </Rise>

        <Rise index={1}>
          <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            {BRAND.name} gives your school everything in one place — admissions, fee vouchers,
            attendance, exams and accounts, with a portal for every teacher and parent — so you can
            focus on the children, not the registers.
          </p>
        </Rise>

        <Rise index={2} className="mt-12 flex flex-wrap items-center gap-6">
          <Link href="/signup" className={cn(LIGHT_PILL, 'min-h-12 px-8 text-base')}>
            Start free trial
          </Link>
          <a
            href="#packages"
            className="inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-medium text-foreground/85 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Explore our pricing
            <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
          </a>
        </Rise>

        <div id="product-preview" data-parallax className="relative mt-16 sm:mt-24">
          <Rise index={3} className="marketing-fade-bottom">
            <div data-parallax-layer="tilt">
              <figure className="rounded-t-tile border border-b-0 border-foreground/20 bg-foreground/10 p-2 pb-0">
                {/* The admin dashboard, built in markup after the product
                    owner's screenshot and animated in CSS (ADR-0022). */}
                <div className="marketing-paper overflow-hidden rounded-t-2xl bg-background">
                  <AdminDashboardMock />
                </div>
              </figure>
            </div>
          </Rise>
        </div>
      </div>
    </section>
  );
}
