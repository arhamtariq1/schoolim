import { toDecimalString, type MinorUnits } from './minor-units';

export const DEFAULT_CURRENCY = 'PKR';
export const DEFAULT_MONEY_LOCALE = 'en-PK';

export interface MoneyFormatOptions {
  /** BCP-47 locale. Urdu rendering switches this, not the arithmetic. */
  readonly locale?: string;
  /** ISO 4217 code. Present so a future non-PKR market is a parameter, not a rewrite. */
  readonly currency?: string;
  /** Render the currency symbol. Off inside tables, where the column header carries it. */
  readonly withSymbol?: boolean;
}

/**
 * Render money for display **only**.
 *
 * The API never sends a formatted money string (ADR-0007) — the wire carries
 * integers and the UI formats them. Never parse the output of this function.
 *
 * Amounts stay within `numeric(14,2)`, so the intermediate `Number` division
 * below is exact to the 14 significant digits `Intl` needs; the exact value for
 * storage always comes from `toDecimalString`, never from here.
 */
function fractionDigitsForMinor(amount: MinorUnits): { minimum: number; maximum: number } {
  const paisa = Math.abs(Math.trunc(amount)) % 100;
  if (paisa === 0) {
    return { minimum: 0, maximum: 0 };
  }
  return { minimum: 2, maximum: 2 };
}

export function formatMoney(amount: MinorUnits, options: MoneyFormatOptions = {}): string {
  const { locale = DEFAULT_MONEY_LOCALE, currency = DEFAULT_CURRENCY, withSymbol = true } = options;

  const major = Number(toDecimalString(amount));
  const { minimum, maximum } = fractionDigitsForMinor(amount);

  return new Intl.NumberFormat(locale, {
    ...(withSymbol ? { style: 'currency' as const, currency } : {}),
    minimumFractionDigits: minimum,
    maximumFractionDigits: maximum,
  }).format(major);
}

/**
 * Money as a bare grouped number, for table cells and PDF columns where the
 * heading already says the currency. Whole rupees omit “.00”; paisa show two
 * decimals so sub-rupee amounts stay exact.
 */
export function formatMoneyPlain(amount: MinorUnits, locale = DEFAULT_MONEY_LOCALE): string {
  return formatMoney(amount, { locale, withSymbol: false });
}
