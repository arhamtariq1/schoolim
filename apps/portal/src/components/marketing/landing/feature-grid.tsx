import { cn } from '@ilm/ui';
import {
  AttendanceIcon,
  ClassIcon,
  FeesIcon,
  ForwardIcon,
  ICON_SIZE,
  MessagesIcon,
  StudentsIcon,
} from '@ilm/ui/icons';
import type { ComponentType } from 'react';

import { Reveal } from '@/components/marketing/marketing-parts';
import { AttendancePreview, ResultPreview } from '@/components/marketing/marketing-previews';
import { SAMPLE_SCHOOL } from '@/components/marketing/marketing-sample-school';
import { CONTAINER, SECTION_Y } from '@/components/marketing/sections/shared';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

type Feature = { Icon: IconComponent; title: string; body: string; href: string };

/** Each "Learn more" goes to the part of this page that says more about it. */
const STUDENTS: Feature = {
  Icon: StudentsIcon,
  title: 'Student management',
  body: 'Admissions, guardians, siblings, documents and the whole history — one record per student, in one place.',
  href: '#why',
};
const ACADEMICS: Feature = {
  Icon: ClassIcon,
  title: 'Academic performance',
  body: 'Your subjects and assessments, keyboard-fast marks entry, and result cards printed from the same records.',
  href: '#results',
};
const FEES: Feature = {
  Icon: FeesIcon,
  title: 'Fee management',
  body: 'A month of vouchers in one run, challans three to an A4, and a defaulter list that sorts itself.',
  href: '#packages',
};
const ATTENDANCE: Feature = {
  Icon: AttendanceIcon,
  title: 'Attendance tracking',
  body: 'Students and staff, by day or by period, marked from any phone — the office sees it the moment it is taken.',
  href: '#results',
};
const PARENTS: Feature = {
  Icon: MessagesIcon,
  title: 'Parent communication',
  body: 'Parents see their own children’s vouchers and send leave, fee and record requests to the office.',
  href: '#roles',
};

function FeatureCard({ Icon, title, body, href, className }: Feature & { className?: string }) {
  return (
    <article
      className={cn(
        'marketing-lift group rounded-tile bg-tint-gray flex flex-col p-5 lg:p-6',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-300 motion-safe:group-hover:scale-110">
        <Icon className={ICON_SIZE.nav} aria-hidden />
      </span>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <a
        href={href}
        aria-label={`Learn more about ${title.toLowerCase()}`}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 self-start rounded-sm text-sm font-semibold text-foreground transition-colors duration-150 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Learn more
        <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
      </a>
    </article>
  );
}

/**
 * "Everything you need": five grey module cards in three columns, the middle
 * one opening on a flat browser window of the product — after the
 * product owner's reference, in the brand's colours.
 */
export function FeatureGrid() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={cn(CONTAINER, SECTION_Y, 'scroll-mt-24')}
    >
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2
          id="features-title"
          className="font-display text-display-md text-heading font-medium text-balance"
        >
          Everything you need for a better-run school
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
          From the admission form to the result card, the office, the teachers and the parents work
          from the same record — so nothing is entered twice and nobody waits for a register.
        </p>
      </Reveal>

      <div className="mt-16 grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          <Reveal index={0} className="flex flex-1">
            <FeatureCard {...STUDENTS} className="flex-1" />
          </Reveal>
          <Reveal index={1} className="flex flex-1">
            <FeatureCard {...ACADEMICS} className="flex-1" />
          </Reveal>
        </div>

        <div className="flex flex-col gap-4">
          <Reveal index={1} from="scale">
            {/* A browser window rather than a phone, and flat — no shadow — so
                it sits in the grid as one more tile. `marketing-paper` keeps
                the product's own palette inside it. */}
            <div
              aria-hidden
              className="marketing-paper rounded-tile overflow-hidden border border-border bg-card"
            >
              <div className="flex items-center gap-3 border-b border-border bg-muted px-4 py-3">
                <span className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                  <span className="size-2.5 rounded-full bg-border" />
                </span>
                <span className="mx-auto truncate rounded-full bg-card px-4 py-1 text-xs text-muted-foreground">
                  {SAMPLE_SCHOOL.name} — Marks & results
                </span>
              </div>
              <div className="space-y-3 p-4">
                <ResultPreview />
                <AttendancePreview />
              </div>
            </div>
          </Reveal>
          <Reveal index={2} className="flex flex-1">
            <FeatureCard {...FEES} className="flex-1" />
          </Reveal>
        </div>

        <div className="flex flex-col gap-4">
          <Reveal index={2} className="flex flex-1">
            <FeatureCard {...ATTENDANCE} className="flex-1" />
          </Reveal>
          <Reveal index={3} className="flex flex-1">
            <FeatureCard {...PARENTS} className="flex-1" />
          </Reveal>
        </div>
      </div>

      <Reveal className="mt-12 flex justify-center">
        <a
          href="#results"
          className="inline-flex min-h-12 items-center gap-3 rounded-full bg-primary py-1.5 ps-6 pe-1.5 text-base font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Explore features
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-foreground text-primary">
            <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
          </span>
        </a>
      </Reveal>
    </section>
  );
}
