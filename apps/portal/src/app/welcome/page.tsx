import { TRIAL_DAYS } from '@ilm/contracts';
import { Button, Money } from '@ilm/ui';
import {
  AttendanceIcon,
  ChevronDownIcon,
  FeesIcon,
  FinanceIcon,
  ForwardIcon,
  ICON_SIZE,
  StudentsIcon,
} from '@ilm/ui/icons';
import { BRAND, minorUnits } from '@ilm/utils';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';

import lemmaLogo from '../../../public/auth/lemma-logo.png';

import { MarketingBootstrap } from '@/components/marketing/marketing-bootstrap';
import { LetterRoll } from '@/components/marketing/marketing-letters';
import { Manifesto } from '@/components/marketing/marketing-manifesto';
import { Label, Reveal, Rise, Rule, WordReveal } from '@/components/marketing/marketing-parts';
import { MarketingRevealGuard } from '@/components/marketing/marketing-reveal-guard';
import { MarketingSmoothScroll } from '@/components/marketing/marketing-smooth-scroll';
import { MarketingStatus } from '@/components/marketing/marketing-status';
import { displayFont } from '@/lib/marketing-fonts';
import { getPublicPlans } from '@/lib/public-plans';

/**
 * The public landing page, served at the apex — ADR-0010, art-directed per
 * ADR-0019.
 *
 * Reached by a rewrite from `/` (see `src/proxy.ts`), so the address bar reads
 * as the bare domain. This is the only page in the portal with no tenant and no
 * session, which makes it the only page allowed to say anything about the
 * product rather than about a school.
 *
 * ## The art direction, in one paragraph
 *
 * Type-led and scroll-led. A warm cream ground, Urbanist at a few weights, and
 * almost no boxes — what structures the page is scale, space and sequence. The
 * two set pieces are a manifesto that lights word by word as it is read, and a
 * deck of numbered panels that stick and stack as you pass them. Colour is used
 * four times, as a marker rather than a surface. Nothing floats, spins or
 * slides past on a loop: every piece of motion on this page is something the
 * reader caused.
 *
 * ## What is deliberately absent
 *
 * No testimonials, no customer logos, no usage statistics, no screenshots of
 * invented data. There are no customers to quote yet, and a school reading this
 * page is deciding whether to trust us with its fee collection — manufactured
 * proof is a worse failure here than a plain page. What the page argues from
 * instead is checkable: three challan copies to an A4 sheet, money kept to the
 * paisa, one school's rows unreachable from another's queries.
 *
 * ## Motion
 *
 * Reveals are CSS transitions driven by one `IntersectionObserver` in
 * `MarketingBootstrap`; smooth scrolling, the manifesto's lighting and the
 * progress read-out are Lenis, in `MarketingSmoothScroll`. All of it is inert
 * under `prefers-reduced-motion`, and the page is complete as served HTML with
 * no JavaScript at all. ADR-0019 has the reasoning and the failure table.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — school management for Pakistan`,
  description:
    'Admissions, fees, attendance, exams and accounts in one place. Configure it yourself, in rupees, in an afternoon.',
};

/**
 * Plans are data, not code: prices and plan details come from the platform
 * console (`getPublicPlans`) and are cached for a short window. Pricing is
 * decision D2 (docs/15) and still open, which is exactly why it must be
 * editable without a deploy.
 */
// A literal, not an imported constant: Next reads route-segment config statically
// and rejects anything it cannot evaluate at build time. Keep it equal to
// PLANS_REVALIDATE_SECONDS in lib/public-plans.ts.
export const revalidate = 30;

/**
 * The deck.
 *
 * `tint` is a complete class name rather than a colour key, because Tailwind
 * finds classes by scanning source text — `bg-tint-${key}` is invisible to it
 * and compiles to nothing at all. Each tint appears once, on a single small
 * marker, which is the whole of this page's use of colour.
 *
 * `detail` is three short facts rather than another paragraph: by the fourth
 * panel a reader is scanning, and a second paragraph is what they skip.
 */
const CAPABILITIES = [
  {
    Icon: StudentsIcon,
    tint: 'bg-tint-mint',
    title: 'Admissions and records',
    body: 'One page answers every question reception is asked on the phone — fees, attendance, guardians, history — so nobody is put on hold while somebody checks a register.',
    detail: [
      'Guardians and siblings linked',
      'Documents on the record',
      'Full history per student',
    ],
  },
  {
    Icon: FeesIcon,
    tint: 'bg-tint-butter',
    title: 'Fees that reconcile',
    body: 'Fee heads, plans and discounts you configure yourself. Monthly vouchers generate in one run, and every correction is a reversing entry rather than a quiet edit.',
    detail: ['Challans print for the bank', 'Arrears carried forward', 'Nothing overwritten'],
  },
  {
    Icon: AttendanceIcon,
    tint: 'bg-tint-peach',
    title: 'Attendance as it happens',
    body: 'Marked from the phone a teacher already owns, by period or by day, and visible to the office the moment it is taken rather than at the end of the month.',
    detail: ['Works on a 4G phone', 'By period or by day', 'Visible to the office live'],
  },
  {
    Icon: FinanceIcon,
    tint: 'bg-tint-lavender',
    title: 'Books that balance',
    body: 'Collection against expected, ageing by bucket, and a day book the accountant can print and sign. The finance module is the product, not a report bolted onto it.',
    detail: ['Day book, printed and signed', 'Ageing by bucket', 'Expenses and payroll'],
  },
] as const;

/**
 * The three-beat statement under the hero.
 *
 * It is the shape of the problem, not a feature list: a school's year is one
 * loop of these three verbs, and the product is an attempt to make the loop
 * close. Three because two is a slogan and four stops scanning.
 */
const PRINCIPLES = [
  {
    verb: 'Record',
    body: 'Admissions, attendance and marks, entered once, by the person who already has the information.',
  },
  {
    verb: 'Reconcile',
    body: 'Every rupee lands against a student, a head and a month — so the ledger and the register never disagree.',
  },
  {
    verb: 'Report',
    body: 'Challans, result cards, day books and defaulter lists, printed from the same records they were entered into.',
  },
] as const;

/**
 * The four facts along the foot of the hero.
 *
 * Every one of them is checkable in this repository, which is the test any
 * claim on this page has to pass. In order: ADR-0010, ADR-0007, the challan
 * print layout in `globals.css`, and ADR-0002.
 */
const PROOF = [
  { term: `${TRIAL_DAYS} days free`, detail: 'No card, no sales call' },
  { term: 'Paisa-exact', detail: 'Money is never a float' },
  { term: 'Three to a sheet', detail: 'Challans print on A4' },
  { term: 'Row-level isolation', detail: 'Enforced by the database' },
];

const STEPS = [
  {
    title: 'Create your school',
    body: 'Your name, your address at this domain, your own password. One form, under a minute, nobody in the loop.',
  },
  {
    title: 'Set up what you charge',
    body: 'Classes, sections, fee heads and plans — in your words and your amounts. This is the part competitors do for you and then bill you for.',
  },
  {
    title: 'Invite the people who use it',
    body: 'Office staff, teachers and guardians. Each one sees only what their role allows, and the menu is built from their permissions.',
  },
] as const;

/**
 * Objections, answered.
 *
 * Phrased narrowly on purpose. Where something is not built yet it says so —
 * the interface being English today is the obvious example — because the first
 * promise this page breaks is the last thing a school believes.
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
    q: `What happens during the ${TRIAL_DAYS} days?`,
    a: 'You use all of it, with your real students and your real fee structure, and we do not ask for a card. Nothing is charged and nothing auto-renews, because billing is not switched on during a trial at all.',
  },
];

const NAV = [
  { href: '#capabilities', label: 'What it does' },
  { href: '#how', label: 'How it works' },
  { href: '#packages', label: 'Packages' },
  { href: '#questions', label: 'Questions' },
];

/** The index as a custom property — the stagger and deck offsets are computed values (docs/16 §2). */
function indexVar(name: '--stack-index', value: number): CSSProperties {
  return { [name]: value } as CSSProperties;
}

/** Two digits, so `01` and `04` occupy the same width down a column. */
const pad = (value: number) => String(value).padStart(2, '0');

export default async function WelcomePage() {
  const plans = await getPublicPlans();
  return (
    <div
      id="top"
      className={`marketing ${displayFont.variable} min-h-dvh bg-background text-foreground`}
    >
      {/* Before the content, so the attribute is set before the hero paints. */}
      <MarketingBootstrap />
      {/* After it, and after hydration: re-observes anything React replaced,
          which is how the headline could end up invisible for good. */}
      <MarketingRevealGuard />
      <MarketingSmoothScroll />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-6 focus:top-6 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-5 lg:px-12"
        >
          {/* The same asset the auth screens use, so the page a school lands on
              and the screen it signs up through carry one mark. It is not a
              link: this *is* the home page, and a logo that navigates to where
              you already are is a dead control. */}
          <Image
            src={lemmaLogo}
            alt={BRAND.name}
            data-logo
            className="h-9 w-auto object-contain object-left sm:h-10"
            priority
          />

          <ul className="mx-auto hidden items-center gap-8 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <LetterRoll text={item.label} />
                </a>
              </li>
            ))}
          </ul>

          <div className="ms-auto flex items-center gap-5 lg:ms-0">
            <Link
              href="/login"
              className="hidden rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:inline-flex"
            >
              <LetterRoll text="Sign in" />
            </Link>
            <Button asChild size="touch" className="rounded-full px-5">
              <Link href="/signup">Start free</Link>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* ------------------------------------------------------------------
            Hero.

            One sentence at the largest size the page has, a live status line
            above it and four facts ruled off below. No image: the alternative
            was a mocked-up dashboard full of invented students, and a school
            can tell the difference between a product and a picture of one.
            ------------------------------------------------------------------ */}
        {/* Full-bleed so the blobs can run to the edges; the measure and the
            gutters are set on the inner container instead, matching every
            section below it exactly. Putting the padding on the section as
            well left the hero's text a gutter out of line with the rest of the
            page — visible the moment you scroll past it. */}
        <section className="relative isolate overflow-hidden pt-10 pb-12 lg:pt-20 lg:pb-16">
          {/* `isolate` is what makes the blobs' `z-index: -1` work: it creates a
              stacking context, so they sit behind the hero's content but still
              in front of the page background. `overflow-hidden` because a 26rem
              circle hanging off the start edge is exactly how a page acquires a
              horizontal scrollbar on a 360px phone. */}
          <span aria-hidden data-blob className="marketing-blob marketing-blob-a bg-tint-mint" />

          <div className="mx-auto max-w-7xl px-6 lg:px-12">
            <Rise index={0}>
              <p className="tracking-label text-xs font-medium text-muted-foreground uppercase">
                <MarketingStatus place="Built in Pakistan" />
              </p>
            </Rise>

            <WordReveal
              as="h1"
              startIndex={1}
              text="One place for the register, the ledger and the result card."
              className="text-display-lg mt-10 max-w-5xl font-semibold"
            />

            <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:items-end">
              <Rise index={3} className="lg:col-span-7">
                <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                  Admissions, fees, attendance, exams and accounts — configured by you, not by a
                  developer. Set your school up in an afternoon and keep the records straight for
                  the rest of the year.
                </p>
              </Rise>

              <Rise index={4} className="lg:col-span-5">
                <div className="flex flex-wrap items-center gap-4 lg:justify-end">
                  <Button asChild size="touch" className="rounded-full px-6">
                    <Link href="/signup">
                      Set up your school
                      <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
                    </Link>
                  </Button>
                  <Link
                    href="/login"
                    className="group inline-flex items-center gap-2 rounded-full text-sm font-medium transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    I already have an account
                    <ForwardIcon
                      className={`${ICON_SIZE.inline} transition-transform group-hover:translate-x-1`}
                      aria-hidden
                    />
                  </Link>
                </div>
              </Rise>
            </div>

            {/* The four facts, ruled off rather than boxed. */}
            <div className="mt-16">
              <Rule />
              <dl className="grid gap-8 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
                {PROOF.map((fact, position) => (
                  <Reveal key={fact.term} index={position}>
                    <dt className="flex items-baseline gap-3 text-sm font-semibold">
                      <span className="tabular text-xs text-muted-foreground">
                        {pad(position + 1)}
                      </span>
                      {fact.term}
                    </dt>
                    <dd className="mt-2 ps-8 text-sm text-muted-foreground">{fact.detail}</dd>
                  </Reveal>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The manifesto.

            The page's one long statement, set large and lit word by word as it
            is scrolled through. This is the only place the product is allowed
            to argue at length, and it earns the room by being the thing the
            reader is physically moving through.
            ------------------------------------------------------------------ */}
        <section
          aria-labelledby="manifesto-heading"
          className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20 lg:px-12 lg:py-32"
        >
          <Reveal>
            <Label id="manifesto-heading">01 — Why it exists</Label>
          </Reveal>

          <Manifesto
            className="text-display-sm mt-10 max-w-5xl leading-snug font-medium"
            text={`The register is in one cupboard. The receipt book is in another. The spreadsheet lives on somebody's own laptop, and none of it reconciles, because none of it is in the same place. ${BRAND.name} keeps one record for each student, and every rupee, mark and absence hangs off it — so the answer to "has this family paid?" is the same answer in the office, in the accounts, and on the phone.`}
          />

          <div className="mt-20 grid gap-12 lg:grid-cols-3 lg:gap-16">
            {PRINCIPLES.map((principle, position) => (
              <Reveal key={principle.verb} index={position}>
                <Rule index={position} />
                <h3 className="text-display-xs mt-6 font-semibold">{principle.verb}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {principle.body}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The deck.

            Four panels that stick, each a little lower than the last, so they
            gather into a stack with every previous panel's edge still showing.
            The mechanism is `position: sticky` and an offset keyed to the
            index — no scroll listener, no pinning library, nothing to go out of
            sync. See the `[data-stack]` rules in `globals.css`.
            ------------------------------------------------------------------ */}
        <section
          id="capabilities"
          aria-labelledby="capabilities-heading"
          className="mx-auto max-w-7xl scroll-mt-24 px-6 pb-20 lg:px-12 lg:pb-32"
        >
          <Reveal>
            <Label>02 — What it does</Label>
          </Reveal>
          <WordReveal
            as="h2"
            id="capabilities-heading"
            text="Built around the four things a school does every single day."
            className="text-display-sm mt-6 max-w-3xl font-semibold"
          />

          <div data-stack className="mt-16">
            {CAPABILITIES.map(({ Icon, title, body, detail, tint }, position) => (
              <article
                key={title}
                data-stack-item
                style={indexVar('--stack-index', position)}
                className="rounded-tile shadow-tile mb-6 border border-border bg-card p-8 lg:p-12"
              >
                <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
                  <div className="lg:col-span-5">
                    <div className="flex items-center gap-4">
                      <span
                        className={`${tint} inline-flex size-12 shrink-0 items-center justify-center rounded-full`}
                      >
                        <Icon className={`${ICON_SIZE.heading} text-foreground`} aria-hidden />
                      </span>
                      <span className="tabular text-xs font-medium text-muted-foreground">
                        {pad(position + 1)} / {pad(CAPABILITIES.length)}
                      </span>
                    </div>
                    <h3 className="text-display-xs mt-6 font-semibold text-balance">{title}</h3>
                  </div>

                  <div className="lg:col-span-7">
                    <p className="text-base leading-relaxed text-muted-foreground">{body}</p>
                    <ul className="mt-8 grid gap-3 sm:grid-cols-3">
                      {detail.map((item) => (
                        <li key={item} className="text-sm text-muted-foreground">
                          <span className="mb-2 block h-px w-8 bg-border" aria-hidden />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------------
            How it works. Three rows, numbered, ruled.
            ------------------------------------------------------------------ */}
        <section
          id="how"
          aria-labelledby="how-heading"
          className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20 lg:px-12 lg:py-32"
        >
          <Reveal>
            <Label>03 — Getting started</Label>
          </Reveal>
          <WordReveal
            as="h2"
            id="how-heading"
            text="Three steps, and one afternoon."
            className="text-display-sm mt-6 font-semibold"
          />

          <ol className="mt-16">
            {STEPS.map((step, position) => (
              <li key={step.title}>
                <Rule index={position} />
                <Reveal index={position} className="grid gap-4 py-10 lg:grid-cols-12 lg:gap-12">
                  <span className="tabular text-sm text-muted-foreground lg:col-span-2">
                    {pad(position + 1)}
                  </span>
                  <h3 className="text-display-xs font-semibold lg:col-span-4">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground lg:col-span-6">
                    {step.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
          <Rule />
        </section>

        {/* ------------------------------------------------------------------
            Packages.

            Three columns divided by hairlines rather than three cards. The
            recommended one is marked with a label and a heavier rule, never
            with colour alone — docs/16 §6 is a rule, and this page is printed
            and screenshotted as often as any screen in the product.
            ------------------------------------------------------------------ */}
        <section
          id="packages"
          aria-labelledby="packages-heading"
          className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20 lg:px-12 lg:py-32"
        >
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <Reveal>
                <Label>04 — Packages</Label>
              </Reveal>
              <WordReveal
                as="h2"
                id="packages-heading"
                text="Priced per campus, billed in rupees."
                className="text-display-sm mt-6 font-semibold"
              />
            </div>
            <Reveal index={1} className="lg:col-span-6 lg:self-end">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Every package starts with the same {TRIAL_DAYS}-day trial, and you can change or
                cancel at any time. Billed in Pakistani rupees, with nothing to sign.
              </p>
            </Reveal>
          </div>

          {plans === undefined || plans.length === 0 ? (
            // No plans to show: either none are published or the list could
            // not be loaded. Say so and offer the way forward, never an empty
            // gap where the prices should be.
            <Reveal className="mt-16 border-t border-border pt-8">
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {plans === undefined
                  ? 'Pricing is unavailable right now. Please check back shortly, or start your free trial and we will confirm the price with you.'
                  : 'Pricing is shared when you start. Begin your free trial and we will confirm the right package for your school.'}
              </p>
              <Button asChild size="touch" className="mt-6 rounded-full">
                <Link href="/signup">Start free trial</Link>
              </Button>
            </Reveal>
          ) : (
            <div className="mt-16 grid gap-12 lg:grid-cols-3 lg:gap-0">
              {plans.map((plan, position) => {
                const isRecommended = plan.isRecommended;
                return (
                  <Reveal
                    key={plan.code}
                    index={position}
                    className={`flex h-full flex-col ${position % 3 === 0 ? 'lg:pe-12' : 'lg:border-s lg:border-border lg:px-12'}`}
                  >
                    <Rule index={position} className={isRecommended ? 'bg-primary' : undefined} />

                    <div className="mt-6 flex items-baseline justify-between gap-3">
                      <h3 className="text-display-xs font-semibold">{plan.name}</h3>
                      {isRecommended ? <Label className="text-primary">Most schools</Label> : null}
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">{plan.tagline}</p>

                    <p className="mt-8 flex items-baseline gap-2">
                      <Money
                        valueMinor={minorUnits(plan.priceMinor)}
                        withSymbol
                        className="text-display-xs font-semibold"
                      />
                      <span className="text-xs text-muted-foreground">
                        / {plan.billingCycle === 'YEARLY' ? 'year' : 'month'}
                      </span>
                    </p>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {plan.studentCap === null
                        ? 'No student limit'
                        : `Up to ${plan.studentCap.toLocaleString('en-PK')} students`}
                    </p>

                    {/* `flex-1` so the button sits on the bottom edge of every
                      column regardless of how many features are listed — three
                      buttons at three heights is the detail that makes a
                      pricing row look unfinished. */}
                    <ul className="mt-8 flex-1 space-y-3 border-t border-border pt-8">
                      {plan.features.map((feature) => (
                        <li key={feature} className="text-sm leading-relaxed text-muted-foreground">
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <Button
                      asChild
                      size="touch"
                      tone={isRecommended ? 'primary' : 'outline'}
                      className="mt-8 w-full rounded-full"
                    >
                      <Link href="/signup">Start free trial</Link>
                    </Button>
                  </Reveal>
                );
              })}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------------
            Questions.

            Native `<details>`: keyboard-operable, findable with the browser's
            own find-in-page, and nought bytes of JavaScript. An accordion
            component here would be three of those things worse.
            ------------------------------------------------------------------ */}
        <section
          id="questions"
          aria-labelledby="questions-heading"
          className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20 lg:px-12 lg:py-32"
        >
          <Reveal>
            <Label>05 — Questions</Label>
          </Reveal>
          <WordReveal
            as="h2"
            id="questions-heading"
            text="Before you sign up."
            className="text-display-sm mt-6 font-semibold"
          />

          <div className="mt-16">
            {QUESTIONS.map((item, position) => (
              <Reveal key={item.q} index={position}>
                <Rule index={position} />
                <details className="group py-6">
                  <summary className="flex cursor-pointer list-none items-baseline gap-6 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    <span className="tabular text-xs text-muted-foreground">
                      {pad(position + 1)}
                    </span>
                    <h3 className="flex-1 text-base font-semibold">{item.q}</h3>
                    <ChevronDownIcon
                      className={`${ICON_SIZE.inline} shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180`}
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-4 max-w-2xl ps-10 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </details>
              </Reveal>
            ))}
            <Rule />
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The one dark moment on the page.

            Flat deep teal rather than the brand gradient, and the colours on
            it are `.marketing-invert`'s inverted tokens rather than
            `text-white/70` — see the comment on that class in `globals.css`.
            One ground colour is one measurable contrast ratio; a gradient is
            three, and the lightest of them is where the auth panel's own
            white/70 falls under the line.
            ------------------------------------------------------------------ */}
        <section aria-labelledby="final-cta" className="px-6 pb-20 lg:px-12 lg:pb-32">
          <div className="mx-auto max-w-7xl">
            <Reveal>
              <div className="marketing-invert rounded-tile bg-background px-6 py-20 text-foreground lg:px-16 lg:py-28">
                <div className="max-w-3xl">
                  <Label>{TRIAL_DAYS} days free</Label>
                  {/* A plain heading, not a `WordReveal`: the panel itself is
                      already the gesture here, and staggering words inside
                      something that is simultaneously rising is two animations
                      arguing over one sentence. */}
                  <h2 id="final-cta" className="text-display-md mt-8 font-semibold text-balance">
                    Set your school up this afternoon.
                  </h2>
                  <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground">
                    One form creates your school, your account and your trial. No card, no sales
                    call, and nobody from us in the middle of it.
                  </p>
                  <div className="mt-12">
                    <Button asChild size="touch" className="rounded-full px-8">
                      <Link href="/signup">
                        Set up your school
                        <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ----------------------------------------------------------------
          Footer.

          Four columns of links that roll letter by letter, an email whose
          underline sweeps out from the start edge, and a back-to-top whose
          arrow lifts. Every one of them is a hover state rather than something
          playing on a loop — the same rule the rest of the page follows.
          ---------------------------------------------------------------- */}
      <footer className="mx-auto max-w-7xl px-6 pb-12 lg:px-12">
        <Rule />

        <div className="grid gap-12 pt-12 lg:grid-cols-12 lg:gap-8">
          <Reveal index={0} className="lg:col-span-4">
            <Image
              src={lemmaLogo}
              alt={BRAND.name}
              data-logo
              className="h-9 w-auto object-contain object-left"
            />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted-foreground">
              School management for Pakistan — admissions, fees, attendance, exams and accounts in
              one place.
            </p>
            <p className="tracking-label mt-6 text-xs font-medium text-muted-foreground uppercase">
              <MarketingStatus place="Built in Pakistan" />
            </p>
          </Reveal>

          <Reveal index={1} className="lg:col-span-3">
            <Label>Navigate</Label>
            <ul className="mt-5 space-y-3">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="inline-flex rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <LetterRoll text={item.label} />
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal index={2} className="lg:col-span-2">
            <Label>Account</Label>
            <ul className="mt-5 space-y-3">
              <li>
                <Link
                  href="/signup"
                  className="inline-flex rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <LetterRoll text="Start free" />
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="inline-flex rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <LetterRoll text="Sign in" />
                </Link>
              </li>
            </ul>
          </Reveal>

          <Reveal index={3} className="lg:col-span-3">
            <Label>Support</Label>
            <p className="mt-5">
              <a
                href={`mailto:${BRAND.supportEmail}`}
                data-underline
                className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {BRAND.supportEmail}
              </a>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {TRIAL_DAYS} days free. No card, no sales call.
            </p>
          </Reveal>
        </div>

        <Rule className="mt-16" />

        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <p className="text-xs text-muted-foreground">
            © {BRAND.name} — school management for Pakistan.
          </p>
          {/* `#top` is the page container, so this is a real anchor: it works
              as a plain jump with no JavaScript, and Lenis eases it when there
              is. */}
          <a
            href="#top"
            className="group inline-flex items-center gap-2 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <LetterRoll text="Back to top" />
            <ForwardIcon
              className={`${ICON_SIZE.inline} -rotate-90 transition-transform duration-300 group-hover:-translate-y-1`}
              aria-hidden
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
