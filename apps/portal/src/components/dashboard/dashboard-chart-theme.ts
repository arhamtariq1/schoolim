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
    return `${Math.round(rupees / 1_000)}k`;
  }
  return String(Math.round(rupees));
}

/** Paisa → compact label with optional Rs prefix. */
export function formatMinorCompact(amountMinor: number, withSymbol = true): string {
  const label = formatRupeesCompact(Math.round(amountMinor / 100));
  return withSymbol ? `Rs ${label}` : label;
}

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
