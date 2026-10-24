import { TRIAL_DAYS } from '@ilm/contracts';
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@ilm/ui';
import {
  ApproveIcon,
  ChevronDownIcon,
  CloseIcon,
  CreateIcon,
  DepositIcon,
  EmailIcon,
  ForwardIcon,
  HistoryIcon,
  ICON_SIZE,
  LockedIcon,
  MenuIcon,
  PhoneIcon,
  StaffIcon,
} from '@ilm/ui/icons';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ComponentType, ReactNode, SVGProps } from 'react';

import lemmaLogo from '../../../public/auth/lemma-logo.png';

import { AdminDashboardMock } from '@/components/marketing/marketing-admin-dashboard';
import { MarketingBootstrap } from '@/components/marketing/marketing-bootstrap';
import { MarketingCarousel } from '@/components/marketing/marketing-carousel';
import {
  BENEFITS,
  COMPARISON,
  CONTACT,
  EVERY_PLAN,
  FAQ,
  FEATURES,
  FOOTER_LINKS,
  NAV,
  PACKAGES,
  PLAN_MATRIX,
  PROBLEMS,
  ROLES,
  SECURITY,
  SHOWCASE,
  STATS,
  STEPS,
  type GapPreview,
  type PlanCell,
  type RoleId,
  type ShowcasePreview,
} from '@/components/marketing/marketing-content';
import { MarketingHub } from '@/components/marketing/marketing-hub';
import {
  AdmissionMock,
  AdminPreview,
  AttendanceMock,
  FeesMock,
  FinanceMock,
  OfficePreview,
  ParentMock,
  ParentPreview,
  PlatformPreview,
  PrincipalPreview,
  ProductFrame,
  ResultsMock,
  SampleCaption,
  StudentProfileMock,
  TeacherPreview,
} from '@/components/marketing/marketing-mockups';
import { Label, Reveal, Rise, WordReveal } from '@/components/marketing/marketing-parts';
import { MarketingPricing } from '@/components/marketing/marketing-pricing';
import { MarketingRevealGuard } from '@/components/marketing/marketing-reveal-guard';
import { MarketingSmoothScroll } from '@/components/marketing/marketing-smooth-scroll';
import { accentFont } from '@/lib/marketing-fonts';

/**
 * The public landing page, served at the apex — ADR-0010, art-directed per
 * ADR-0022.
 *
 * Paper and ink: a near-white ground ruled by the hairlines of one framed
 * container, numbered sections in the manner of the Awwwards startup
 * references, and three dark bands — the portals, the closing call and the
 * footer. Every word that is not a heading lives in `marketing-content.ts`;
 * every product screen is a labelled sample from `marketing-mockups.tsx`.
 *
 * The honesty rules of ADR-0019 still hold: no testimonials, no customer
 * logos, no usage figures. The large numerals are properties of the product,
 * and the pricing is the D2 placeholder that `PACKAGES` warns about.
 *
 * Motion is the existing system — reveals from `MarketingBootstrap`, smooth
 * scroll and parallax from `MarketingSmoothScroll` — plus a CSS-only ticker and
 * hub, the ticker paused on hover or focus and both absent under reduced
 * motion. The page is complete as served HTML without any JavaScript.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — school management for Pakistan`,
  description:
    'Admissions, fee vouchers, attendance, exams, staff and accounts in one place, with a portal for admins, principals, teachers, parents and office staff.',
};

const LINK =
  'inline-flex rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const PILL =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/20 px-5 text-sm font-medium transition-colors duration-200 hover:bg-foreground hover:text-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const PRIMARY =
  'inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** The reference's white pill: the light action on the ink header and hero. */
const LIGHT_PILL =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors duration-200 hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** The column every section sits in. No container lines: the product owner dropped them. */
const FRAME = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-12';

const SHOWCASE_SCREEN: Record<ShowcasePreview, { url: string; Screen: ComponentType }> = {
  fees: { url: 'crescent.school/fees/vouchers', Screen: FeesMock },
  attendance: { url: 'crescent.school/attendance', Screen: AttendanceMock },
  results: { url: 'crescent.school/exams/results', Screen: ResultsMock },
  finance: { url: 'crescent.school/finance', Screen: FinanceMock },
};

const ROLE_PREVIEW: Record<RoleId, ComponentType> = {
  admin: AdminPreview,
  principal: PrincipalPreview,
  teacher: TeacherPreview,
  parent: ParentPreview,
  office: OfficePreview,
  platform: PlatformPreview,
};

/** The screen each gap card opens on, and the device it is shown on. */ const GAP_PREVIEW: Record<
  GapPreview,
  { Screen: ComponentType; device: 'desktop' | 'phone' }
> = {
  admission: { Screen: AdmissionMock, device: 'desktop' },
  profile: { Screen: StudentProfileMock, device: 'desktop' },
  fees: { Screen: FeesMock, device: 'desktop' },
  attendance: { Screen: AttendanceMock, device: 'desktop' },
  parent: { Screen: ParentMock, device: 'phone' },
};

const SECURITY_ICONS: readonly ComponentType<SVGProps<SVGSVGElement>>[] = [
  LockedIcon,
  DepositIcon,
  HistoryIcon,
  StaffIcon,
];

const pad = (value: number) => String(value).padStart(2, '0');

export default function WelcomePage() {
  return (
    <div
      id="top"
      className={cn('marketing min-h-dvh bg-background text-foreground', accentFont.variable)}
    >
      <MarketingBootstrap />
      <MarketingSmoothScroll />
      <MarketingRevealGuard />

      <a
        href="#main"
        className="sr-only rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main">
        <Hero />
        <ModuleTicker />
        <Gap />
        <Thesis />
        <Tour />
        <Portals />
        <Modules />
        <Numbers />
        <Comparison />
        <Security />
        <Onboarding />
        <Benefits />
        <Pricing />
        <Questions />
        <ClosingCall />
      </main>

      <SiteFooter />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The numbered head every section opens with: "(03) The gap" on a hairline,
 * then the headline and an optional lead paragraph. After the indexed sections
 * of indisea.com and zig.ai.
 */
function SectionHead({
  index,
  label,
  title,
  titleId,
  lead,
  align = 'start',
}: {
  index: number;
  label: string;
  title: string;
  titleId: string;
  lead?: string;
  align?: 'start' | 'center';
}) {
  return (
    <header className={cn(align === 'center' && 'mx-auto max-w-3xl text-center')}>
      <Label className={cn('flex gap-3', align === 'center' && 'justify-center')}>
        <span className="text-primary tabular-nums">({pad(index)})</span>
        <span>{label}</span>
      </Label>
      <WordReveal
        id={titleId}
        text={title}
        className="text-display-lg mt-6 max-w-4xl font-semibold"
      />
      {lead === undefined ? null : (
        <Reveal index={1}>
          <p
            className={cn(
              'mt-6 max-w-2xl text-lg text-pretty text-muted-foreground',
              align === 'center' && 'mx-auto',
            )}
          >
            {lead}
          </p>
        </Reveal>
      )}
    </header>
  );
}

function Section({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className="scroll-mt-16">
      <div className={cn(FRAME, 'py-16 sm:py-24', className)}>{children}</div>
    </section>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <Image
      src={lemmaLogo}
      alt={BRAND.name}
      data-logo
      className={cn('h-8 w-auto object-contain object-left', className)}
      priority
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

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
function SiteHeader() {
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

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

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
function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="marketing-ink marketing-aurora relative overflow-hidden bg-background"
    >
      <div className="relative mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-24 lg:px-12">
        <Rise>
          <a
            href="#portals"
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
            href="#pricing"
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

/* -------------------------------------------------------------------------- */
/* The module ticker                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Where the reference sites run a strip of customer logos, this runs the
 * modules — the honest equivalent while there are no customers to name.
 */
function ModuleTicker() {
  const run = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-12 pe-12">
      {FEATURES.map(({ Icon, title }) => (
        <li key={title} className="flex items-center gap-3 text-lg font-medium whitespace-nowrap">
          <Icon className={cn(ICON_SIZE.heading, 'text-primary')} aria-hidden />
          {title}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-12">
      <h2 className="sr-only">Modules in {BRAND.name}</h2>
      <div data-marquee-wrap className="overflow-hidden">
        <div data-marquee className="flex w-max">
          {run(false)}
          {run(true)}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* (02) The gap — before and after                                            */
/* -------------------------------------------------------------------------- */

function Gap() {
  return (
    <Section labelledBy="gap-title">
      <SectionHead
        index={2}
        label="The gap"
        titleId="gap-title"
        title="Paper is where school records go to *disappear*."
        lead="Five problems every principal recognises from this week — and what each one looks like once there is one record instead of five registers."
      />

      {/* A bento of five: each card opens on the screen that answers its
          problem, then names the problem, the old way and the new one. */}
      <ol className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        {PROBLEMS.map((row, index) => {
          const { Screen, device } = GAP_PREVIEW[row.preview];
          const wide = index === 0;
          return (
            <li
              key={row.preview}
              className={wide ? 'md:col-span-2 lg:col-span-4' : 'lg:col-span-2'}
            >
              <Reveal
                index={index % 3}
                className="rounded-tile shadow-tile group flex h-full flex-col overflow-hidden bg-card"
              >
                <div
                  aria-hidden
                  className="relative h-56 overflow-hidden bg-primary/5 px-6 pt-6 lg:h-64"
                >
                  <div className="marketing-peek-fade h-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:-translate-y-2">
                    {device === 'phone' ? (
                      <div className="shadow-tile mx-auto w-56 rounded-t-3xl bg-card p-2 pb-0">
                        <div className="rounded-t-2xl bg-background px-4 pt-2">
                          <span className="mx-auto mb-3 block h-1 w-12 rounded-full bg-border" />
                          <Screen />
                        </div>
                      </div>
                    ) : (
                      <div className="shadow-tile overflow-hidden rounded-t-xl bg-background">
                        <div className="marketing-peek">
                          <Screen />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-4 p-6 sm:p-8">
                  <h3 className="flex items-baseline gap-3 text-xl font-semibold text-balance">
                    <span className="text-sm text-primary tabular-nums">{pad(index + 1)}</span>
                    {row.problem}
                  </h3>
                  {/* The wide card sets the old way and the new side by side. */}
                  <div
                    className={cn(
                      'flex flex-1 flex-col gap-4',
                      wide && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6',
                    )}
                  >
                    <p className="flex gap-3 text-sm text-muted-foreground">
                      <CloseIcon className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0')} aria-hidden />
                      <span>
                        <span className="sr-only">Before: </span>
                        {row.before}
                      </span>
                    </p>
                    <p
                      className={cn(
                        'mt-auto flex gap-3 rounded-xl bg-primary/10 p-4 text-sm',
                        wide && 'lg:mt-0',
                      )}
                    >
                      <ApproveIcon
                        className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0 text-primary')}
                        aria-hidden
                      />
                      <span>
                        <span className="sr-only">With {BRAND.name}: </span>
                        {row.after}
                      </span>
                    </p>
                  </div>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ol>
      <SampleCaption className="mt-8" />
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* The thesis — one large statement                                           */
/* -------------------------------------------------------------------------- */

function Thesis() {
  return (
    <section aria-labelledby="thesis-title">
      <div className={cn(FRAME, 'py-24 text-center')}>
        <WordReveal
          id="thesis-title"
          text="A parent never sees your software. They see the *voucher*."
          className="text-display-lg mx-auto max-w-5xl font-semibold"
        />
        <Reveal index={1}>
          <p className="mx-auto mt-8 max-w-2xl text-lg text-pretty text-muted-foreground">
            So the challan prints for the bank, the result card prints for the file, and the
            attendance reaches the parent’s phone the same day. Everything the school hands over is
            right, because it all comes from the same record.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* (03) Product tour                                                          */
/* -------------------------------------------------------------------------- */

function Tour() {
  return (
    <Section id="product" labelledBy="tour-title">
      <SectionHead
        index={3}
        label="Inside the product"
        titleId="tour-title"
        title="Built for the four jobs that *eat* the month."
        lead="Fees, attendance, results and the books. The work that keeps an office late is the work this product was designed around."
      />

      <ol className="mt-16 space-y-24">
        {SHOWCASE.map((item, index) => {
          const { url, Screen } = SHOWCASE_SCREEN[item.preview];
          const flip = index % 2 === 1;
          return (
            <li key={item.preview} className="grid gap-12 lg:grid-cols-12 lg:items-center">
              <Reveal className={cn('lg:col-span-5', flip && 'lg:order-2 lg:col-start-8')}>
                <p className="text-display-sm font-semibold text-primary tabular-nums">
                  / {pad(index + 1)}
                </p>
                <h3 className="text-display-sm mt-4 font-semibold">{item.title}</h3>
                <p className="mt-4 text-pretty text-muted-foreground">{item.body}</p>
                <ul className="mt-8 flex flex-wrap gap-2">
                  {item.detail.map((detail) => (
                    <li
                      key={detail}
                      className="rounded-full border border-border bg-card px-3 py-1 text-sm"
                    >
                      {detail}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <div
                data-parallax
                className={cn('lg:col-span-7', flip && 'lg:order-1 lg:col-start-1')}
              >
                <div data-parallax-layer>
                  <ProductFrame url={url} label={item.title}>
                    <Screen />
                  </ProductFrame>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <SampleCaption className="mt-12" />
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* (04) Portals — the ink band                                                */
/* -------------------------------------------------------------------------- */

function Portals() {
  return (
    <section
      id="portals"
      aria-labelledby="portals-title"
      className="scroll-mt-16 px-2 pb-16 sm:px-4"
    >
      <div className="marketing-ink rounded-tile bg-background">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <SectionHead
                index={4}
                label="Six portals"
                titleId="portals-title"
                title="One record. A portal for *everyone*."
                lead="Every person in the school signs in to a screen built for their job, and every screen reads from the same record — so an attendance mark is in the parent’s portal before the bell."
              />
            </div>
            <Reveal index={1} className="mx-auto hidden w-full max-w-lg md:block lg:col-span-6">
              <MarketingHub />
            </Reveal>
          </div>

          <Tabs defaultValue={ROLES[0].id} className="mt-16">
            <TabsList
              aria-label="Portals"
              className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-2xl"
            >
              {ROLES.map((role) => (
                <TabsTrigger key={role.id} value={role.id} className="min-h-11 rounded-xl px-4">
                  {role.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {ROLES.map((role) => {
              const Preview = ROLE_PREVIEW[role.id];
              return (
                <TabsContent
                  key={role.id}
                  value={role.id}
                  data-role-panel
                  className="mt-8 grid gap-12 lg:grid-cols-12 lg:items-center"
                >
                  <div className="lg:col-span-5">
                    <p className="text-sm font-medium text-primary">{role.tagline}</p>
                    <h3 className="text-display-sm mt-2 font-semibold">{role.name}</h3>
                    <p className="mt-4 text-pretty text-muted-foreground">{role.body}</p>
                    <ul className="mt-8 space-y-3">
                      {role.points.map((point) => (
                        <li key={point} className="flex gap-3 text-sm">
                          <ApproveIcon
                            className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0 text-primary')}
                            aria-hidden
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="marketing-paper lg:col-span-7">
                    <Preview />
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
          <SampleCaption className="mt-8" />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* (05) Modules                                                               */
/* -------------------------------------------------------------------------- */

function Modules() {
  return (
    <Section id="modules" labelledBy="modules-title">
      <SectionHead
        index={5}
        label="Modules"
        titleId="modules-title"
        title="Twelve modules. *One* login."
        lead="Switch on what your school needs today. Everything shares one student record, so nothing is typed twice and every report agrees with every other."
      />

      <ul className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ Icon, title, body, soon }, index) => (
          <li key={title} data-feature className="flex flex-col bg-background p-6">
            <div className="flex items-center justify-between gap-4">
              <span
                data-feature-mark
                className="inline-flex size-12 items-center justify-center rounded-full bg-muted"
              >
                <Icon className={ICON_SIZE.heading} aria-hidden />
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{pad(index + 1)}</span>
            </div>
            <h3 className="mt-8 flex flex-wrap items-center gap-2 text-lg font-semibold">
              {title}
              {soon === true ? (
                <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Coming soon
                </span>
              ) : null}
            </h3>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* The numbers                                                                */
/* -------------------------------------------------------------------------- */

function Numbers() {
  return (
    <section aria-label={`${BRAND.name} in numbers`}>
      <div className={FRAME}>
        <ul className="grid divide-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
          {STATS.map((stat, index) => (
            <li key={stat.unit} className="border-b border-border py-12 sm:px-6 lg:border-b-0">
              <Reveal index={index}>
                <span className="font-display text-display-xl block font-semibold text-primary tabular-nums">
                  {stat.value}
                </span>
                <span className="mt-2 block text-lg font-semibold">{stat.unit}</span>
                <span className="mt-2 block text-sm text-pretty text-muted-foreground">
                  {stat.detail}
                </span>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* (06) Comparison                                                            */
/* -------------------------------------------------------------------------- */

function Comparison() {
  const [ours, ...theirs] = COMPARISON.columns;
  return (
    <Section labelledBy="comparison-title">
      <SectionHead
        index={6}
        label="Compared"
        titleId="comparison-title"
        title="Against the register and the *spreadsheet*."
        lead="Not against another vendor — against the two ways most schools in Pakistan actually run today."
      />

      <div className="mt-16 hidden grid-cols-12 gap-6 border-b border-border pb-4 md:grid">
        <span className="col-span-3" />
        <Label className="col-span-3 text-primary">{ours}</Label>
        {theirs.map((column) => (
          <Label key={column} className="col-span-3">
            {column}
          </Label>
        ))}
      </div>
      <dl className="mt-8 md:mt-0">
        {COMPARISON.rows.map((row) => (
          <div
            key={row.topic}
            className="grid gap-2 border-b border-border py-6 md:grid-cols-12 md:gap-6"
          >
            <dt className="font-semibold md:col-span-3">{row.topic}</dt>
            {row.values.map((value, index) => (
              <dd
                key={COMPARISON.columns[index]}
                className={cn(
                  'flex gap-2 text-sm md:col-span-3',
                  index === 0 ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                <span className="w-28 shrink-0 text-xs text-muted-foreground md:hidden">
                  {COMPARISON.columns[index]}
                </span>
                {index === 0 ? (
                  <ApproveIcon
                    className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0 text-primary')}
                    aria-hidden
                  />
                ) : null}
                {value}
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* (07) Security                                                              */
/* -------------------------------------------------------------------------- */

function Security() {
  return (
    <Section id="security" labelledBy="security-title">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionHead
            index={7}
            label="Security and trust"
            titleId="security-title"
            title="Built like a *ledger*."
            lead="A school trusts its software with children’s records and its parents’ money. These are the four rules the product is built on — enforced in code, not promised in a policy."
          />
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {SECURITY.map((item, index) => {
            const Icon = SECURITY_ICONS[index] ?? LockedIcon;
            return (
              <li key={item.title}>
                <Reveal
                  index={index}
                  className="rounded-tile h-full border border-border bg-card p-6"
                >
                  <Icon className={cn(ICON_SIZE.heading, 'text-primary')} aria-hidden />
                  <h3 className="mt-6 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-pretty text-muted-foreground">{item.body}</p>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* (08) Onboarding timeline                                                   */
/* -------------------------------------------------------------------------- */

function Onboarding() {
  return (
    <Section id="how" labelledBy="how-title">
      <SectionHead
        index={8}
        label="Getting started"
        titleId="how-title"
        title="From sign-up to your first month, *without* a consultant."
      />

      <ol className="relative mt-16 grid gap-8 lg:grid-cols-4">
        <span aria-hidden className="absolute inset-x-0 top-2 hidden h-px bg-border lg:block" />
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            <Reveal index={index}>
              <span aria-hidden className="relative block size-4 rounded-full bg-primary" />
              <p className="mt-6 text-sm font-medium text-primary">
                {step.when} · {pad(index + 1)}
              </p>
              <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-pretty text-muted-foreground">{step.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* (09) Benefits                                                              */
/* -------------------------------------------------------------------------- */

function Benefits() {
  return (
    <Section labelledBy="benefits-title">
      <SectionHead
        index={9}
        label="Why schools switch"
        titleId="benefits-title"
        title="What changes in the *first* term."
      />
      <MarketingCarousel label="Why schools switch" className="mt-12">
        {BENEFITS.map((benefit, index) => (
          <article
            key={benefit.title}
            className="rounded-tile flex w-full flex-col justify-between gap-12 border border-border bg-card p-6 sm:p-8"
          >
            <span className="text-display-sm font-semibold text-primary tabular-nums">
              {pad(index + 1)}
            </span>
            <div>
              <h3 className="text-xl font-semibold">{benefit.title}</h3>
              <p className="mt-2 text-sm text-pretty text-muted-foreground">{benefit.body}</p>
            </div>
          </article>
        ))}
      </MarketingCarousel>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* (10) Pricing                                                               */
/* -------------------------------------------------------------------------- */

function PlanValue({ value }: { value: PlanCell }) {
  if (value === true) {
    return (
      <>
        <ApproveIcon className={cn(ICON_SIZE.inline, 'mx-auto text-primary')} aria-hidden />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <span aria-hidden className="text-muted-foreground">
          —
        </span>
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return <>{value}</>;
}

function Pricing() {
  return (
    <Section id="pricing" labelledBy="pricing-title">
      <SectionHead
        index={10}
        align="center"
        label="Pricing"
        titleId="pricing-title"
        title="Simple pricing, per *campus*."
        lead={`Every plan starts with ${String(TRIAL_DAYS)} days free, with every module switched on and no card asked for. Pay monthly, or pay for the year and get two months free.`}
      />

      <div className="mt-12">
        <MarketingPricing />
      </div>

      <div className="rounded-tile mt-8 border border-border bg-muted p-6 sm:p-8">
        <h3 className="text-sm font-semibold">Included in every plan</h3>
        <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {EVERY_PLAN.map((item) => (
            <li key={item} className="flex gap-3">
              <ApproveIcon
                className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0 text-primary')}
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <details className="group mt-8">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-full text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          Compare every feature
          <ChevronDownIcon
            className={cn(ICON_SIZE.inline, 'transition-transform group-open:rotate-180')}
            aria-hidden
          />
        </summary>
        <div className="mt-8">
          <table className="w-full text-sm">
            <caption className="sr-only">Features by plan</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-4 text-start font-medium text-muted-foreground">
                  Feature
                </th>
                {PACKAGES.map((plan) => (
                  <th key={plan.code} scope="col" className="w-1/5 py-4 text-center font-semibold">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            {PLAN_MATRIX.map((group) => (
              <tbody key={group.group}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="tracking-label pt-8 pb-2 text-start text-xs font-medium text-muted-foreground uppercase"
                  >
                    {group.group}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.feature} className="border-b border-border">
                    <th scope="row" className="py-3 pe-4 text-start font-normal">
                      {row.feature}
                    </th>
                    {row.values.map((value, index) => (
                      <td key={PACKAGES[index]?.code} className="py-3 text-center">
                        <PlanValue value={value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </details>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Prices in Pakistani rupees, per campus, exclusive of applicable taxes. Running several
        campuses or more than 1,000 students?{' '}
        <a
          href={`mailto:${BRAND.supportEmail}`}
          data-underline
          className="text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Talk to us
        </a>
        .
      </p>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* (11) FAQ                                                                   */
/* -------------------------------------------------------------------------- */

function Questions() {
  return (
    <Section id="faq" labelledBy="faq-title">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHead
            index={11}
            label="Questions"
            titleId="faq-title"
            title="Asked, and *answered*."
          />
          <Reveal index={1}>
            <p className="mt-6 text-sm text-muted-foreground">
              Something else on your mind?{' '}
              <a
                href={`mailto:${CONTACT.email}`}
                data-underline
                className="text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Write to us
              </a>{' '}
              — a person answers, {CONTACT.hours}.
            </p>
          </Reveal>
        </div>

        <Tabs defaultValue={FAQ[0].id} className="lg:col-span-8">
          <TabsList aria-label="Question topics" className="flex h-auto flex-wrap justify-start">
            {FAQ.map((topic) => (
              <TabsTrigger key={topic.id} value={topic.id} className="min-h-11 px-4">
                {topic.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {FAQ.map((topic) => (
            <TabsContent key={topic.id} value={topic.id} className="mt-6">
              <ul className="border-t border-border">
                {topic.items.map((item) => (
                  <li key={item.q} className="border-b border-border">
                    <details>
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        {item.q}
                        <CreateIcon
                          data-faq-mark
                          className={cn(ICON_SIZE.nav, 'shrink-0 text-primary')}
                          aria-hidden
                        />
                      </summary>
                      <p className="max-w-2xl pb-6 text-pretty text-muted-foreground">{item.a}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* The closing call                                                           */
/* -------------------------------------------------------------------------- */

function ClosingCall() {
  return (
    <section aria-labelledby="closing-title" className="px-2 pt-16 sm:px-4">
      <div className="marketing-ink rounded-tile bg-background">
        <div className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-12">
          <WordReveal
            id="closing-title"
            text="Put the register *back* in the cupboard."
            className="text-display-xl mx-auto max-w-5xl font-semibold"
          />
          <Reveal index={1}>
            <p className="mx-auto mt-8 max-w-xl text-lg text-pretty text-muted-foreground">
              Create your school in under a minute and run a real month on {BRAND.name} —{' '}
              {TRIAL_DAYS} days free, with nothing to install and no card asked for.
            </p>
          </Reveal>
          <Reveal index={2} className="mt-12 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={PRIMARY}>
              Start your free trial
              <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
            </Link>
            <a href={`mailto:${CONTACT.email}`} className={PILL}>
              Talk to us
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

function SiteFooter() {
  return (
    <footer className="px-2 pt-2 pb-2 sm:px-4 sm:pb-4">
      <div className="marketing-ink rounded-tile overflow-hidden bg-background">
        <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="text-display-xs font-semibold">
                School management that keeps its books straight.
              </p>
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-3">
                  <EmailIcon className={ICON_SIZE.inline} aria-hidden />
                  <a
                    href={`mailto:${CONTACT.email}`}
                    data-underline
                    className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {CONTACT.email}
                  </a>
                </li>
                <li className="flex items-center gap-3">
                  <PhoneIcon className={ICON_SIZE.inline} aria-hidden />
                  {CONTACT.phone}
                </li>
                <li className="ps-8">{CONTACT.hours}</li>
              </ul>
            </div>

            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8"
            >
              {FOOTER_LINKS.map((column) => (
                <div key={column.heading}>
                  <Label>{column.heading}</Label>
                  <ul className="mt-4 space-y-3">
                    {column.links.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} className={LINK}>
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border py-6 text-xs text-muted-foreground">
            <p>
              © {BRAND.name} · {CONTACT.city}
            </p>
            <a href="#top" className={LINK}>
              Back to top
            </a>
          </div>
        </div>
        <p
          aria-hidden
          className="font-display text-display-2xl text-center font-semibold text-muted select-none"
        >
          {BRAND.name}
        </p>
      </div>
    </footer>
  );
}
