import { systemClock } from '@ilm/utils';

/** Inclusive calendar-month bounds as `YYYY-MM-DD`. */
export function calendarMonthRange(reference = systemClock.now()): { from: string; to: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = `${String(year)}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

export function previousCalendarMonthRange(reference = systemClock.now()): { from: string; to: string } {
  const prev = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return calendarMonthRange(prev);
}

/** Reference-style range label, e.g. `1 Oct 2026 – 31 Oct 2026`. */
export function formatInclusiveDateRange(from: string, to: string): string {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (start === undefined || end === undefined) {
    return '';
  }
  const fmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function parseIsoDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return undefined;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
