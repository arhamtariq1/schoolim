'use client';

import { Money, cn } from '@ilm/ui';
import { ApproveIcon, ForwardIcon, ICON_SIZE } from '@ilm/ui/icons';
import Link from 'next/link';
import { useState } from 'react';

import { PACKAGES, type BillingCycle } from './marketing-content';

/**
 * The three plan cards and the monthly / annual switch above them — ADR-0022.
 *
 * The only reason this is a client island is the switch. Without JavaScript it
 * renders the monthly prices, which are the ones every other line on the page
 * quotes, and the switch simply does not respond.
 *
 * The switch is two `aria-pressed` buttons rather than a Radix `Switch`: the
 * two states have names ("Monthly", "Annual"), and a toggle with a name on each
 * side reads better to a screen reader as a pair of pressed buttons than as one
 * on/off control whose meaning depends on which side is "on".
 */
export function MarketingPricing() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  return (
    <div>
      <div
        role="group"
        aria-label="Billing period"
        className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border bg-card p-1"
      >
        {(
          [
            ['monthly', 'Monthly'],
            ['annual', 'Annual · 2 months free'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={cycle === value}
            onClick={() => setCycle(value)}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm font-medium transition-colors duration-200',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              cycle === value
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="mt-12 grid gap-4 lg:grid-cols-3">
        {PACKAGES.map((plan) => (
          <li
            key={plan.code}
            className={cn(
              'rounded-tile flex flex-col border p-6 sm:p-8',
              plan.recommended
                ? 'marketing-ink shadow-tile border-transparent bg-background text-foreground'
                : 'border-border bg-card',
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              {plan.recommended ? (
                <span className="tracking-label rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground uppercase">
                  Most chosen
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{plan.forWhom}</p>

            <p className="mt-8 flex items-baseline gap-2">
              <Money
                withSymbol
                valueMinor={cycle === 'monthly' ? plan.priceMinor : plan.annualPriceMinor}
                data-plan-price
                className="font-display font-semibold"
              />
              <span className="text-sm text-muted-foreground">
                / campus / {cycle === 'monthly' ? 'month' : 'year'}
              </span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {plan.studentCap === undefined
                ? 'Any number of students'
                : `Up to ${plan.studentCap.toLocaleString('en-PK')} students`}
              {cycle === 'annual' ? ' · billed once a year' : ' · billed monthly'}
            </p>

            <Link
              href={plan.href}
              className={cn(
                'mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors duration-200',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                plan.recommended
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border border-foreground/20 hover:bg-foreground hover:text-background',
              )}
            >
              {plan.cta}
              <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
            </Link>

            <ul className="mt-8 space-y-3 border-t border-border pt-6 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-3">
                  <ApproveIcon
                    className={cn(ICON_SIZE.inline, 'mt-0.5 text-primary')}
                    aria-hidden
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
