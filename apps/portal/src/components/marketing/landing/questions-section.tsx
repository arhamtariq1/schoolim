import { TRIAL_DAYS } from '@ilm/contracts';
import { cn } from '@ilm/ui';
import { ChevronDownIcon, EmailIcon, ICON_SIZE, MessagesIcon } from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import Link from 'next/link';

import { Reveal } from '@/components/marketing/marketing-parts';
import {
  CONTAINER,
  GHOST_ON_DARK,
  SECTION_Y,
  SectionHeading,
} from '@/components/marketing/sections/shared';
import { LIGHT_PILL } from '@/components/marketing/sections/site-header';

/**
 * Objections, answered. Phrased narrowly on purpose: where something is not
 * built yet it says so, because the first promise this page breaks is the last
 * thing a school believes.
 */
const QUESTIONS = [
  {
    q: 'Is there anything to install?',
    a: 'No. It runs in a browser, including the browser on the phone a teacher already owns, on a 4G connection. There is no desktop software, no server to buy and nothing for your IT person to maintain.',
  },
  {
    q: 'Can it handle Urdu names?',
    a: 'Names are stored and shown exactly as they are typed, in Urdu or English, on screen and on printed documents. The interface itself is in English today; it is built so it can be translated without the screens being rebuilt.',
  },
  {
    q: 'Who in my school can see what?',
    a: 'Each person has a role, and the menu is generated from what that role is allowed to do rather than hidden with a disabled button. A teacher sees their own classes. A guardian sees their own children and nothing else — not even that another family exists.',
  },
  {
    q: 'Can we still print fee challans for the bank?',
    a: 'Yes, and it is a first-class part of the product rather than a screenshot. Three copies go across a landscape A4 sheet, or four on a portrait one, with your logo, your bank details and a copy for the bank.',
  },
  {
    q: 'Is our data separate from other schools?',
    a: 'Yes, and not only by convention. Every row carries the school it belongs to and the database enforces it on every query, so a mistake in the application cannot return another school’s students. It is the first thing we built.',
  },
  {
    q: `What happens during the ${String(TRIAL_DAYS)} days?`,
    a: 'You use all of it, with your real students and your real fee structure, and we do not ask for a card. Nothing is charged and nothing auto-renews, because billing is not switched on during a trial at all.',
  },
];

/**
 * Two columns: the heading and a teal "still have a question?" card, held in
 * view on wide screens, beside a numbered list of answers. The card wears the
 * recommended plan's ground so the two teal moments of the lower page match.
 *
 * Native `<details>`: keyboard-operable, searchable with find-in-page, no JavaScript.
 */
export function QuestionsSection() {
  return (
    <section
      id="questions"
      aria-labelledby="questions-title"
      className={cn(CONTAINER, SECTION_Y, 'scroll-mt-24 pt-0 sm:pt-0')}
    >
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-24">
            <SectionHeading
              titleId="questions-title"
              title="Before you sign up"
              lead="Straight answers to what schools ask us first."
            />

            <Reveal index={1} className="mt-8">
              <div className="marketing-ink rounded-tile shadow-frame bg-linear-to-br from-brand-600 to-brand-900 p-6">
                <span className="grid size-12 place-items-center rounded-2xl bg-foreground/10">
                  <MessagesIcon className={ICON_SIZE.heading} aria-hidden />
                </span>
                <h3 className="mt-6 text-xl font-semibold">Still have a question?</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Write to {BRAND.supportEmail} and we will answer it, or try everything yourself
                  for {TRIAL_DAYS} days.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href={`mailto:${BRAND.supportEmail}`}
                    className={cn(LIGHT_PILL, 'font-semibold')}
                  >
                    <EmailIcon className={ICON_SIZE.inline} aria-hidden />
                    Email us
                  </a>
                  <Link href="/signup" className={cn(GHOST_ON_DARK, 'min-h-11 text-sm')}>
                    Start free
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        <div className="space-y-2 lg:col-span-7">
          {QUESTIONS.map((item, position) => (
            <Reveal key={item.q} index={position % 3}>
              <details className="group rounded-tile border border-border bg-card transition-colors duration-200 open:border-primary/40 open:bg-muted">
                <summary className="rounded-tile flex min-h-16 cursor-pointer list-none items-center gap-4 px-4 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-6">
                  <span className="font-display w-6 shrink-0 text-sm font-bold text-primary tabular-nums">
                    {String(position + 1).padStart(2, '0')}
                  </span>
                  <h3 className="flex-1 text-base font-semibold">{item.q}</h3>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-card text-primary transition duration-200 group-open:rotate-180 group-open:border-primary group-open:bg-primary group-open:text-primary-foreground">
                    <ChevronDownIcon className={ICON_SIZE.inline} aria-hidden />
                  </span>
                </summary>
                {/* Indented to the question's start: the padding, the number's `w-6` and the gap. */}
                <p className="ps-14 pe-4 pb-6 text-sm leading-relaxed text-muted-foreground sm:ps-16 sm:pe-16">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
