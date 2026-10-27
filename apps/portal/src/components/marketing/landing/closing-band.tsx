import { TRIAL_DAYS } from '@ilm/contracts';
import { ApproveIcon, ForwardIcon, ICON_SIZE, SuccessIcon } from '@ilm/ui/icons';
import Link from 'next/link';

import { Reveal } from '@/components/marketing/marketing-parts';
import {
  AttendancePreview,
  FinancePreview,
  ResultPreview,
  VoucherPreview,
} from '@/components/marketing/marketing-previews';
import { GHOST_ON_DARK } from '@/components/marketing/sections/shared';
import { LIGHT_PILL } from '@/components/marketing/sections/site-header';

/** Each one is answered in full in the questions above — nothing promised here that is not. */
const ASSURANCES = ['No card needed', 'Nothing to install', 'Your data kept separate'];

/**
 * The last ask: a teal band with the two actions, and a centred collage of
 * module screens — results, fees, attendance, finance — built from the same
 * sample previews as the rest of the page. The pill repeats the hero's, so the
 * page opens and closes on the same gesture; the rings behind the collage are
 * decoration, drawn with borders rather than an image or a blur.
 */
export function ClosingBand() {
  return (
    <section aria-labelledby="closing-title" className="px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
      <Reveal
        from="scale"
        className="marketing-ink rounded-tile shadow-frame relative mx-auto max-w-7xl overflow-hidden bg-linear-to-br from-brand-600 to-brand-900"
      >
        <div className="grid items-center gap-12 px-6 py-16 sm:px-12 lg:grid-cols-12 lg:px-16 lg:py-0">
          <div className="lg:col-span-6 lg:py-24">
            <Reveal index={1}>
              <p className="inline-flex min-h-11 items-center gap-3 rounded-full border border-foreground/15 bg-foreground/5 py-1 ps-1 pe-4 text-sm text-foreground">
                <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
                  <span aria-hidden data-pulse className="size-2 rounded-full bg-primary" />
                  {TRIAL_DAYS} days free
                </span>
                Start today, decide later
              </p>
            </Reveal>

            <Reveal index={2}>
              <h2
                id="closing-title"
                className="font-display text-display-md mt-6 font-medium text-balance text-foreground"
              >
                Your whole school and every family, in one place
              </h2>
              <p className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground">
                One form creates your school, your account and your trial. No card, no sales call,
                and nobody from us in the middle of it.
              </p>
            </Reveal>

            <Reveal index={3} className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/signup" className={LIGHT_PILL}>
                Set up your school
                <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
              </Link>
              <Link href="/login" className={GHOST_ON_DARK}>
                Sign in
              </Link>
            </Reveal>

            <Reveal index={4}>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-foreground/15 pt-6">
                {ASSURANCES.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="grid size-6 place-items-center rounded-full bg-foreground/15">
                      <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal
            from="end"
            index={2}
            className="relative hidden items-center justify-center lg:col-span-6 lg:flex lg:py-16"
          >
            <span
              aria-hidden
              data-breathe
              className="absolute inset-0 m-auto size-96 rounded-full border border-foreground/10"
            />
            <span
              aria-hidden
              data-breathe
              className="absolute inset-0 m-auto size-72 rounded-full border border-foreground/15 bg-foreground/5"
            />

            {/* A collage of real module screens, centred in the column: two
                staggered columns, so it reads as a spread rather than a grid.
                The columns drift at different depths as the band scrolls by
                (`data-parallax`, ADR-0020). */}
            <div
              aria-hidden
              data-parallax
              className="marketing-paper relative grid w-full grid-cols-2 items-start gap-4"
            >
              <div data-parallax-layer className="space-y-4">
                <ResultPreview className="shadow-frame" />
                <VoucherPreview className="shadow-frame" />
              </div>
              <div data-parallax-layer="deep" className="space-y-4 pt-12">
                <AttendancePreview className="shadow-frame" />
                <FinancePreview className="shadow-frame" />
              </div>

              <div
                data-float
                className="shadow-frame absolute -start-6 -bottom-6 flex items-center gap-3 rounded-2xl border border-border bg-card py-3 ps-3 pe-4"
              >
                <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <SuccessIcon className={ICON_SIZE.inline} />
                </span>
                <span>
                  <span className="block text-xs text-muted-foreground">Your school</span>
                  <span className="block text-sm font-semibold">Ready in one form</span>
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </Reveal>
    </section>
  );
}
