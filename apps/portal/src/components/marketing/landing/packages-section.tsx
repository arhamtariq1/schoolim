'use client';

import { ANNUAL_DISCOUNT_BPS, TRIAL_DAYS, type PublicPlan } from '@ilm/contracts';
import { Button, Money, cn } from '@ilm/ui';
import { ApproveIcon, ICON_SIZE, PopularIcon } from '@ilm/ui/icons';
import {
  BRAND,
  minorUnits,
  multiplyMoney,
  percentageOfMoney,
  subtractMoney,
  type MinorUnits,
} from '@ilm/utils';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Reveal } from '@/components/marketing/marketing-parts';
import { CONTAINER, SECTION_Y, SectionHeading } from '@/components/marketing/sections/shared';

type Cycle = 'monthly' | 'yearly';

const DISCOUNT_PERCENT = ANNUAL_DISCOUNT_BPS / 100;

const CUSTOM_FEATURES = [
  'Several campuses under one login',
  'Roles and limits set for you',
  'Help moving your records across',
  'A named contact for support',
];

/**
 * A monthly plan's price paid a year at once: twelve months less
 * `ANNUAL_DISCOUNT_BPS`, worked out in paisa with the money helpers' documented
 * rounding (ADR-0007) — never a float.
 */
function yearly(monthlyMinor: number) {
  const full = multiplyMoney(minorUnits(monthlyMinor), 12);
  const saved = percentageOfMoney(full, ANNUAL_DISCOUNT_BPS);
  return {
    total: subtractMoney(full, saved),
    perMonth: percentageOfMoney(minorUnits(monthlyMinor), 10_000 - ANNUAL_DISCOUNT_BPS),
  };
}

const CARD = 'rounded-tile flex h-full flex-col border p-6';

/**
 * One plan, in two layers: an inset panel that holds the name, the price and
 * the action, and the open list of what is included beneath it. Paper cards
 * lift a little on hover; the teal card is already raised.
 */
function PlanCard({
  name,
  tagline,
  badge,
  price,
  action,
  features,
  onTeal = false,
}: {
  name: string;
  tagline: string;
  badge?: ReactNode;
  price: ReactNode;
  action: ReactNode;
  features: readonly string[];
  onTeal?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-tile relative flex h-full flex-col border p-2 transition duration-200 ease-out',
        onTeal
          ? 'marketing-ink shadow-frame border-transparent bg-linear-to-br from-brand-600 to-brand-900'
          : 'hover:shadow-tile border-border bg-card hover:border-primary/40 motion-safe:hover:-translate-y-1',
      )}
    >
      {/* The badge sits on the card's top edge, at the top right. */}
      {badge ? <div className="absolute end-6 -top-3">{badge}</div> : null}
      <div className={cn('rounded-3xl p-6', onTeal ? 'bg-foreground/10' : 'bg-muted')}>
        <h3 className="text-xl font-semibold">{name}</h3>
        <p className={cn('mt-2 text-sm', onTeal ? 'text-foreground' : 'text-muted-foreground')}>
          {tagline}
        </p>
        {price}
        <div className="mt-6">{action}</div>
      </div>

      <div className="flex flex-1 flex-col px-4 pt-6 pb-4">
        <p
          className={cn(
            'tracking-label text-xs font-semibold uppercase',
            onTeal ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          What’s included
        </p>
        <ul className="mt-4 space-y-3">
          {features.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full',
                  onTeal ? 'bg-foreground/15 text-foreground' : 'bg-primary/10 text-primary',
                )}
              >
                <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Price({
  valueMinor,
  unit,
  note,
  onTeal = false,
}: {
  valueMinor: MinorUnits;
  unit: string;
  note: ReactNode;
  onTeal?: boolean;
}) {
  return (
    <>
      <p className="mt-6 flex items-baseline gap-2">
        <Money
          valueMinor={valueMinor}
          withSymbol
          data-plan-price
          className="font-display font-bold"
        />
        <span className="text-sm">{unit}</span>
      </p>
      <p
        className={cn(
          'mt-1 min-h-10 text-xs',
          onTeal ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {note}
      </p>
    </>
  );
}

function PaidPlan({ plan, cycle }: { plan: PublicPlan; cycle: Cycle }) {
  const teal = plan.isRecommended;
  // A plan the console already prices by the year is shown as it is.
  const isMonthly = plan.billingCycle === 'MONTHLY';
  const year = yearly(plan.priceMinor);

  return (
    <PlanCard
      name={plan.name}
      tagline={plan.tagline}
      onTeal={teal}
      features={plan.features}
      badge={
        teal ? (
          // `marketing-paper` puts the paper tokens back, so the pill is the page's white, not the
          // ink's cream. It wraps the pill rather than sitting on it: its own unlayered `color`
          // would otherwise beat `text-primary`.
          <span className="marketing-paper">
            <span className="shadow-tile inline-flex shrink-0 items-center gap-1 rounded-full border border-primary bg-card py-1 ps-2 pe-3 text-xs font-semibold text-primary">
              <PopularIcon className={cn(ICON_SIZE.inline, 'fill-current')} aria-hidden />
              Most popular
            </span>
          </span>
        ) : null
      }
      action={
        <Button
          asChild
          size="touch"
          tone="primary"
          className={cn(
            'w-full rounded-full',
            // On the teal ground the button inverts: a white pill in the badge's ink.
            teal && 'bg-foreground text-brand-800 hover:bg-foreground/90',
          )}
        >
          <Link href="/signup">Start with {plan.name}</Link>
        </Button>
      }
      price={
        isMonthly && cycle === 'yearly' ? (
          <Price
            valueMinor={year.perMonth}
            unit="/ month"
            onTeal={teal}
            note={
              <>
                Billed yearly at{' '}
                <Money valueMinor={year.total} withSymbol className="text-xs font-semibold" />
              </>
            }
          />
        ) : (
          <Price
            valueMinor={minorUnits(plan.priceMinor)}
            unit={isMonthly ? '/ month' : '/ year'}
            onTeal={teal}
            note={
              plan.studentCap === null
                ? 'No student limit'
                : `Up to ${plan.studentCap.toLocaleString('en-PK')} students`
            }
          />
        )
      }
    />
  );
}

/**
 * Packages: paid plans live from the platform console (`getPublicPlans`), plus
 * a custom plan — with one switch between monthly and yearly prices. The
 * recommended plan is marked with a label *and* the teal ground, never colour
 * alone.
 *
 * Group is a console plan for multi-campus schools, not a public card. The
 * trial is offered from signup, not as a priced column.
 *
 * `undefined` plans means the console could not be reached, and an empty list
 * means nothing is published; the custom card still shows, and the gap where
 * the prices would be says so instead of standing empty.
 */
export function PackagesSection({ plans }: { plans: PublicPlan[] | undefined }) {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const paid = (plans ?? []).filter((plan) => plan.code !== 'group');

  return (
    <section
      id="packages"
      aria-labelledby="packages-title"
      className={cn(CONTAINER, SECTION_Y, 'scroll-mt-24')}
    >
      <SectionHeading
        align="center"
        titleId="packages-title"
        title="Simple pricing, billed in rupees"
        lead={`Start with a ${String(TRIAL_DAYS)}-day free trial. Pay monthly, or pay for the year and save ${DISCOUNT_PERCENT.toString()}%.`}
      />

      <Reveal className="mt-10 flex justify-center">
        <div
          role="group"
          aria-label="Billing period"
          className="bg-tint-gray inline-flex items-center gap-1 rounded-full p-1"
        >
          {(
            [
              ['monthly', 'Monthly'],
              ['yearly', 'Yearly'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={cycle === value}
              onClick={() => {
                setCycle(value);
              }}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-150',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                cycle === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              {value === 'yearly' ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    cycle === value ? 'bg-primary-foreground text-primary' : 'bg-card text-primary',
                  )}
                >
                  Save {DISCOUNT_PERCENT}%
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </Reveal>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {paid.length === 0 ? (
          <Reveal index={0} className="sm:col-span-2">
            <div className={cn(CARD, 'justify-center border-border bg-card')}>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {plans === undefined
                  ? 'Prices are unavailable right now. Please check back shortly, or start your free trial and we will confirm the price with you.'
                  : 'Prices are shared when you start. Begin your free trial and we will confirm the right plan for your school.'}
              </p>
            </div>
          </Reveal>
        ) : (
          paid.map((plan, position) => (
            <Reveal key={plan.code} index={position}>
              <PaidPlan plan={plan} cycle={cycle} />
            </Reveal>
          ))
        )}

        <Reveal index={paid.length}>
          <PlanCard
            name="Custom"
            tagline="For groups and larger schools"
            features={CUSTOM_FEATURES}
            price={
              <>
                <p className="font-display text-display-sm mt-6 font-bold">Let’s talk</p>
                <p className="mt-1 min-h-10 text-xs text-muted-foreground">
                  Priced for your campuses and roles.
                </p>
              </>
            }
            action={
              <Button asChild size="touch" tone="primary" className="w-full rounded-full">
                <a href={`mailto:${BRAND.supportEmail}?subject=Custom%20plan`}>Contact us</a>
              </Button>
            }
          />
        </Reveal>
      </div>
    </section>
  );
}
