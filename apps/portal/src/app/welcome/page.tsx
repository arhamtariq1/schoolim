import { TRIAL_DAYS } from '@ilm/contracts';
import { Money } from '@ilm/ui';
import {
  AttendanceIcon,
  FeesIcon,
  FinanceIcon,
  ICON_SIZE,
  StudentsIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import { BRAND, minorUnits } from '@ilm/utils';
import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * The public landing page, served at the apex — ADR-0010.
 *
 * Reached by a rewrite from `/` (see `src/proxy.ts`), so the address bar reads
 * as the bare domain. This is the only page in the portal with no tenant and no
 * session, which makes it the only page allowed to say anything about the
 * product rather than about a school.
 *
 * **Visual design is deliberately unfinished.** The structure, the tokens and
 * the copy are real; the art direction is not, and is expected to be replaced.
 * Everything here uses semantic tokens and the four type sizes (docs/16 §5–6),
 * so replacing the design does not mean replacing the markup.
 */
export const metadata: Metadata = {
  title: `${BRAND.name} — school management`,
  description: 'Admissions, fees, attendance and reporting for schools in Pakistan.',
};

/**
 * The packages.
 *
 * ⚠️ **Pricing is decision D2 and is still open** (docs/15). These figures are
 * placeholders with a defensible shape — per-student, three tiers, annual
 * discount implied — and they are in one constant precisely so that resolving
 * D2 is an edit here rather than a hunt through JSX. They must not go in front
 * of a real customer before D2 closes; docs/19 §5 has the cost floor that has
 * to be cleared first.
 *
 * Money is minor units, as everywhere else (ADR-0007). A landing page is not an
 * excuse to write "Rs 4,000" into a string.
 */
const PACKAGES = [
  {
    code: 'starter',
    name: 'Starter',
    forWhom: 'A single campus finding its feet',
    priceMinor: 400_000,
    studentCap: 300,
    features: [
      'Students, admissions and guardians',
      'Fee heads, plans and monthly vouchers',
      'Attendance and daily registers',
      'Up to 10 staff accounts',
    ],
  },
  {
    code: 'standard',
    name: 'Standard',
    forWhom: 'An established school running its own accounts',
    priceMinor: 900_000,
    studentCap: 1000,
    features: [
      'Everything in Starter',
      'Full finance: ledgers, expenses, day book',
      'Exams, marks and result cards',
      'SMS and WhatsApp notices',
      'Unlimited staff accounts',
    ],
    recommended: true,
  },
  {
    code: 'group',
    name: 'Group',
    forWhom: 'Several campuses under one administration',
    priceMinor: 2_000_000,
    studentCap: undefined,
    features: [
      'Everything in Standard',
      'Every campus, one login',
      'Consolidated reporting across campuses',
      'Priority support',
    ],
  },
] as const;

const CAPABILITIES = [
  {
    Icon: StudentsIcon,
    title: 'Admissions and records',
    body: 'One page answers every question reception is asked on the phone: fees, attendance, guardians, history.',
  },
  {
    Icon: FeesIcon,
    title: 'Fees that reconcile',
    body: 'Fee heads, plans and discounts you configure yourself. Monthly vouchers generated in one run, and reversible.',
  },
  {
    Icon: AttendanceIcon,
    title: 'Attendance',
    body: 'Marked from a phone in the classroom, by period or by day, and visible to the office as it happens.',
  },
  {
    Icon: FinanceIcon,
    title: 'Books that balance',
    body: 'Collection against expected, ageing by bucket, and a day book the accountant can print and sign.',
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold text-foreground">{BRAND.name}</span>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Start free trial
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
              Run the whole school from one place.
            </h1>
            <p className="mt-4 text-base text-muted-foreground">
              Admissions, fees, attendance, exams and accounts — configured by you, not by a
              developer. Set your school up in an afternoon and keep the records straight for the
              rest of the year.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Set up your school
              </Link>
              <Link
                href="/login"
                className="flex h-11 items-center rounded-md border border-border px-6 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                I already have an account
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {TRIAL_DAYS} days free. No card, no sales call, no setup fee.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="capabilities"
          className="border-t border-border bg-muted/30 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="capabilities" className="text-lg font-semibold text-foreground">
              What it does
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {CAPABILITIES.map(({ Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-6">
                  <Icon className={`${ICON_SIZE.heading} text-primary`} aria-hidden />
                  <h3 className="mt-3 text-base font-medium text-foreground">{title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="packages" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="packages" className="text-lg font-semibold text-foreground">
              Packages
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Billed monthly in Pakistani rupees. Every package starts with the same {TRIAL_DAYS}
              -day trial, and you can change or cancel at any time.
            </p>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              {PACKAGES.map((plan) => (
                <div
                  key={plan.code}
                  className={
                    // Status is never colour alone (docs/16 §6): the recommended
                    // package carries a label, not just a border.
                    'recommended' in plan
                      ? 'rounded-xl border-2 border-primary bg-card p-6'
                      : 'rounded-xl border border-border bg-card p-6'
                  }
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-medium text-foreground">{plan.name}</h3>
                    {'recommended' in plan ? (
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        Most schools
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">{plan.forWhom}</p>

                  <p className="mt-6">
                    <Money
                      valueMinor={minorUnits(plan.priceMinor)}
                      withSymbol
                      className="text-xl"
                    />
                    <span className="ms-1 text-xs text-muted-foreground">/ month</span>
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {plan.studentCap === undefined
                      ? 'No student limit'
                      : `Up to ${plan.studentCap.toLocaleString('en-PK')} students`}
                  </p>

                  <ul className="mt-6 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-sm text-foreground">
                        <SuccessIcon
                          className={`${ICON_SIZE.inline} mt-0.5 shrink-0 text-success`}
                          aria-hidden
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signup"
                    className="mt-6 flex h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Start free trial
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-muted-foreground">
          <span>
            {BRAND.name} — school management for Pakistan. Support: {BRAND.supportEmail}
          </span>
          <Link href="/login" className="hover:text-foreground hover:underline">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
