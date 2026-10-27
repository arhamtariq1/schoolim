import { TRIAL_DAYS } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import {
  CalendarIcon,
  ClockIcon,
  ForwardIcon,
  ICON_SIZE,
  LockedIcon,
  PrintIcon,
  StudentsIcon,
  WebIcon,
} from '@ilm/ui/icons';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType } from 'react';

import classroom from '../../../../public/marketing/classroom-uniforms.jpg';

import { Reveal } from '@/components/marketing/marketing-parts';
import { CONTAINER, Eyebrow, PRIMARY, SECTION_Y } from '@/components/marketing/sections/shared';

type IconComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const POINTS: { Icon: IconComponent; title: string; body: string }[] = [
  {
    Icon: ClockIcon,
    title: 'Set up in an afternoon',
    body: 'One form creates your school, with nobody from us in the middle.',
  },
  {
    Icon: WebIcon,
    title: 'Nothing to install',
    body: 'It runs in a browser — including the one on a teacher’s phone.',
  },
  {
    Icon: LockedIcon,
    title: 'Your data, kept apart',
    body: 'Every row carries its school, and the database refuses anything else.',
  },
];

/**
 * The facts beside the photograph. Each is checkable in this repository —
 * ADR-0010, the challan print layout, the six portals — because ADR-0019 still
 * rules out usage figures we cannot show.
 */
const FACTS: { Icon: IconComponent; value: string; label: string }[] = [
  { Icon: CalendarIcon, value: `${String(TRIAL_DAYS)} days`, label: 'Free trial' },
  { Icon: PrintIcon, value: '3 per A4', label: 'Fee challans' },
  { Icon: StudentsIcon, value: '6 portals', label: 'One record' },
];

/**
 * Why schools switch: the argument in a two-column opening, then a bento — the
 * classroom photograph large and uncovered, beside a teal card with the three
 * reasons and a row of facts. Nothing sits on a face in the photograph; its
 * caption rides a dark fade along the bottom edge.
 */
export function EmpowerSection() {
  return (
    <section
      id="why"
      aria-labelledby="empower-title"
      className={cn(CONTAINER, SECTION_Y, 'scroll-mt-24')}
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
        <Reveal className="lg:col-span-7">
          <Eyebrow>Why schools switch</Eyebrow>
          <h2
            id="empower-title"
            className="font-display text-display-md text-heading mt-4 max-w-3xl font-medium text-balance"
          >
            Empowering schools with smart management
          </h2>
        </Reveal>
        <Reveal index={1} className="lg:col-span-5">
          <p className="text-lg text-pretty text-muted-foreground">
            The register, the receipt book and the spreadsheet become one record for each student —
            so “has this family paid?” has the same answer in the office, in the accounts and on the
            phone.
          </p>
          <Link href="/signup" className={cn(PRIMARY, 'mt-6')}>
            Start free trial
            <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
          </Link>
        </Reveal>
      </div>

      <div className="mt-14 grid gap-4 lg:grid-cols-12">
        {/* `fill`, so the photograph takes the height of the column beside it
            instead of setting the row's height from its own proportions. */}
        <Reveal
          from="start"
          className="group rounded-tile relative aspect-4/3 overflow-hidden lg:col-span-7 lg:row-span-2 lg:aspect-auto"
        >
          <Image
            src={classroom}
            alt="Students in school uniform at their desks in a classroom"
            placeholder="blur"
            fill
            sizes="(min-width: 1024px) 44rem, 100vw"
            className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-105"
          />
          <div className="marketing-ink absolute inset-x-0 bottom-0 bg-linear-to-t from-background via-background/70 to-transparent p-6 pt-20 sm:p-8 sm:pt-24">
            <p className="max-w-md text-lg font-semibold text-balance text-foreground">
              One record per student — the office, the accounts and the parents all see the same
              answer.
            </p>
          </div>
        </Reveal>

        <Reveal
          index={1}
          from="end"
          className="marketing-ink rounded-tile bg-linear-to-br from-brand-600 to-brand-900 p-6 sm:p-8 lg:col-span-5"
        >
          <ul className="space-y-6">
            {POINTS.map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-brand-800">
                  <Icon className={ICON_SIZE.nav} aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold text-foreground">{title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* One soft strip of three figures, no border or dividers — a row of
            figures, not three more cards competing with the teal one above. */}
        <Reveal index={2} from="scale" className="lg:col-span-5">
          <ul className="rounded-tile grid h-full grid-cols-3 bg-muted">
            {FACTS.map(({ Icon, value, label }) => (
              <li key={label} className="flex min-w-0 flex-col justify-center p-3 sm:p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className={ICON_SIZE.inline} aria-hidden />
                </span>
                <span className="mt-4 block text-base font-bold whitespace-nowrap sm:text-xl">
                  {value}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{label}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
