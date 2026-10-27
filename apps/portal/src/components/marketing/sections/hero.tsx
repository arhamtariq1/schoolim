import { TRIAL_DAYS } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import { ApproveIcon, ForwardIcon, ICON_SIZE } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';

import { GHOST_ON_DARK } from './shared';
import { LIGHT_PILL } from './site-header';

/** Each is answered in full in the questions further down — nothing promised here that is not. */
const ASSURANCES = [`${String(TRIAL_DAYS)} days free`, 'No card needed', 'Nothing to install'];

import { AdminDashboardMock } from '@/components/marketing/marketing-admin-dashboard';
import { Rise } from '@/components/marketing/marketing-parts';

/**
 * The product owner’s reference, in the brand’s colours: one band of the
 * primary teal, deepening corner to corner as the recommended plan and the
 * closing band do — no folds or glow, at the owner’s request — with a "what’s
 * new" pill, a left-aligned white headline, a white pill and an outlined one,
 * a row of short assurances, and the product itself rising out of the band,
 * fading into the page below. White on `brand-600` measures 4.77:1.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="marketing-ink marketing-brand relative overflow-hidden bg-linear-to-br from-brand-600 to-brand-900"
    >
      {/* The foot of the band dissolves into the page's white behind the
          dashboard, as the old glow did (`.marketing-hero-fade`). */}
      <div
        aria-hidden
        className="marketing-hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
      />
      <div className="relative mx-auto max-w-7xl px-4 pt-28 sm:px-6 sm:pt-36 lg:px-12">
        <Rise>
          <a
            href="#roles"
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
            className="font-display text-display-lg mt-6 max-w-4xl font-medium text-balance"
          >
            Run your whole school. Grow it with {BRAND.name}.
          </h1>
        </Rise>

        <Rise index={1}>
          <p className="mt-4 max-w-2xl text-lg text-pretty text-muted-foreground">
            {BRAND.name} gives your school everything in one place — admissions, fee vouchers,
            attendance, exams and accounts, with a portal for every teacher and parent — so you can
            focus on the children, not the registers.
          </p>
        </Rise>

        <Rise index={2} className="mt-8 flex flex-wrap items-center gap-6">
          <Link href="/signup" className={cn(LIGHT_PILL, 'min-h-12 px-8 text-base')}>
            Start free trial
          </Link>
          <a href="#packages" className={cn(GHOST_ON_DARK, 'border-0')}>
            Explore our pricing
            <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
          </a>
        </Rise>

        <Rise index={2}>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            {ASSURANCES.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm text-foreground/85">
                <span className="grid size-6 place-items-center rounded-full bg-foreground/15">
                  <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </Rise>

        {/* Held still: the scroll tilt redrew this whole, masked dashboard on
            every frame, which is what made the hero slow to scroll. */}
        <div id="product-preview" className="relative mt-16 sm:mt-24">
          <Rise index={3} className="marketing-fade-bottom">
            <figure className="rounded-t-tile border border-b-0 border-foreground/20 bg-foreground/10 p-2 pb-0">
              {/* The admin dashboard, the product's own, on sample data (ADR-0022). */}
              <div className="marketing-paper overflow-hidden rounded-t-2xl bg-background">
                <AdminDashboardMock />
              </div>
            </figure>
          </Rise>
        </div>
      </div>
    </section>
  );
}
