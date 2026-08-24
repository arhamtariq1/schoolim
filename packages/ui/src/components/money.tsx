import { formatMoney, formatMoneyPlain, minorUnits, type MinorUnits } from '@ilm/utils';
import type { ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * The only sanctioned way to render money (docs/16 section 10).
 *
 * It takes **minor units**, never rupees, because ADR-0007 puts integer paisa
 * on the wire and in code. A raw number formatted by hand in a component is a
 * review rejection — not for tidiness, but because hand formatting is where
 * `toFixed(2)` and float drift get back in.
 *
 * Rendering rules, all of which exist because an accountant reads columns of
 * these and notices immediately when they are wrong:
 * - monospace and right-aligned, so decimal points line up down a column;
 * - `tabular-nums`, so digits do not shift width between values;
 * - exactly two decimals, never truncated, never abbreviated to "12.5k";
 * - negative in red **and** parentheses, because colour alone carries no
 *   meaning in print or to a colour-blind reader (docs/16 section 3).
 */
export interface MoneyProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** Integer minor units — paisa. Never rupees. */
  valueMinor: MinorUnits | number;
  /** Show the currency symbol. Off inside tables whose header carries it. */
  withSymbol?: boolean;
  /** BCP-47 locale. Urdu rendering switches this, not the arithmetic. */
  locale?: string;
  /** Render a zero as an em dash, which reads better in a sparse column. */
  dashOnZero?: boolean;
}

export function Money({
  valueMinor,
  withSymbol = false,
  locale,
  dashOnZero = false,
  className,
  ...props
}: MoneyProps) {
  // Re-validated here rather than trusted: this is the last point before a
  // number reaches a person, and a float arriving from an untyped boundary
  // should fail loudly rather than render as "1234.5600000001".
  const amount = minorUnits(valueMinor);
  const isNegative = amount < 0;

  if (dashOnZero && amount === 0) {
    return (
      <span
        className={cn('font-mono text-sm text-muted-foreground tabular-nums', className)}
        {...props}
      >
        —
      </span>
    );
  }

  const formatted = withSymbol
    ? formatMoney(amount, locale === undefined ? {} : { locale })
    : formatMoneyPlain(amount, locale);

  // The minus sign is dropped in favour of parentheses, the accounting
  // convention every school bookkeeper already reads.
  const display = isNegative ? `(${formatted.replace('-', '')})` : formatted;

  return (
    <span
      className={cn(
        'font-mono text-sm whitespace-nowrap tabular-nums',
        isNegative && 'text-danger',
        className,
      )}
      // Screen readers should hear a number, not a parenthesis.
      aria-label={isNegative ? `negative ${formatted.replace('-', '')}` : undefined}
      {...props}
    >
      {display}
    </span>
  );
}

/**
 * A money cell for tables: right-aligned, so a column of figures aligns on the
 * decimal point without every call site remembering to say so.
 */
export function MoneyCell({ className, ...props }: MoneyProps) {
  return <Money className={cn('block text-right', className)} {...props} />;
}
