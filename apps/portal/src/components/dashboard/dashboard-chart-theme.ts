import { divideRoundHalfToEven } from '@ilm/utils';

export type DashboardChartTheme = {
  primary: string;
  primaryMid: string;
  primaryLight: string;
  border: string;
  mutedForeground: string;
};

/** ApexCharts SVG fills need computed sRGB — raw oklch/var() strings render incorrectly. */
export function resolveCssColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }

  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = varName.startsWith('--') ? `var(${varName})` : varName;
  document.documentElement.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  return resolved !== '' ? resolved : fallback;
}

/**
 * Round to the nearest whole number, the one way this codebase rounds.
 *
 * `Math.round` is banned outright (ADR-0007) so that no rounding decision
 * anywhere can quietly be applied to money — and a chart axis is not an
 * exception worth carving, because the same helper is one import away. Adding
 * half before truncating rounds to nearest, and the sign is handled explicitly
 * so a negative net revenue rounds by magnitude rather than toward zero.
 */
function toNearest(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value < 0 ? -Math.trunc(-value + 0.5) : Math.trunc(value + 0.5);
}

/**
 * Paisa → whole rupees, rounded the way ADR-0007 requires of money.
 *
 * `divideRoundHalfToEven` rather than nearest-half-up: repeated half-up
 * rounding biases a total upward, and these figures are summed into the labels
 * a head teacher reads off a revenue chart. `bigint` because the intermediate
 * product of two money-scale integers overflows a safe JS integer.
 */
export function minorToRupees(amountMinor: number): number {
  if (!Number.isFinite(amountMinor)) {
    return 0;
  }
  return Number(divideRoundHalfToEven(BigInt(Math.trunc(amountMinor)), 100n));
}

/** Whole rupees — chart axis labels (e.g. 900000 → "900k"). */
export function formatRupeesCompact(rupees: number): string {
  if (!Number.isFinite(rupees)) {
    return '';
  }
  const abs = Math.abs(rupees);
  if (abs >= 1_000_000) {
    const millions = rupees / 1_000_000;
    const digits = millions % 1 === 0 ? 0 : millions < 10 ? 1 : 0;
    return `${millions.toFixed(digits)}M`;
  }
  if (abs >= 1_000) {
    return `${String(toNearest(rupees / 1_000))}k`;
  }
  return String(toNearest(rupees));
}

/** Paisa → compact label with optional Rs prefix. */
export function formatMinorCompact(amountMinor: number, withSymbol = true): string {
  const label = formatRupeesCompact(minorToRupees(amountMinor));
  return withSymbol ? `Rs ${label}` : label;
}

/** Nearest whole number, for the non-money axes (counts, percentages). */
export { toNearest as roundToNearest };

/** Paired finance charts on the home dashboard share one plot height. */
export const DASHBOARD_FINANCE_CHART_HEIGHT = 260;

export function dashboardChartAxisPadding() {
  return { left: 4, right: 16, top: 4, bottom: 0 };
}

export function readDashboardChartTheme(): DashboardChartTheme {
  const fallbackPrimary = 'rgb(20, 127, 138)';
  const fallbackMid = 'rgb(16, 100, 109)';
  const fallbackLight = 'rgb(72, 160, 170)';
  const fallbackBorder = 'rgb(226, 232, 240)';
  const fallbackMuted = 'rgb(100, 116, 139)';

  if (typeof document === 'undefined') {
    return {
      primary: fallbackPrimary,
      primaryMid: fallbackMid,
      primaryLight: fallbackLight,
      border: fallbackBorder,
      mutedForeground: fallbackMuted,
    };
  }

  return {
    primary: resolveCssColor('--primary', fallbackPrimary),
    primaryMid: resolveCssColor('--color-brand-800', fallbackMid),
    primaryLight: resolveCssColor('--color-brand-400', fallbackLight),
    border: resolveCssColor('--border', fallbackBorder),
    mutedForeground: resolveCssColor('--muted-foreground', fallbackMuted),
  };
}

/**
 * The slice of ApexCharts' donut-total context this dashboard actually reads.
 *
 * Apex types that callback's argument as `any`, which makes every `w.globals`
 * read an unchecked one. Naming the two fields used here is enough to get the
 * sum type-checked, and narrow enough that it cannot drift into pretending to
 * be Apex's full context object.
 */
export interface ApexSeriesTotals {
  readonly globals: { readonly seriesTotals: readonly number[] };
}
