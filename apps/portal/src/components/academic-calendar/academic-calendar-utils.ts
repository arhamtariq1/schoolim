import type { Holiday } from '@ilm/contracts';

import { holidayColorTheme } from '@/components/academic-calendar/calendar-holiday-colors';

type CategoryTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type CalendarViewMode = 'month' | 'week' | 'list';

export type MonthCell = {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
};

/** `2026-10-01` → `{ year: 2026, month: 10 }`. Calendar dates are school-local ISO strings. */
export function parseYearMonth(iso: string): { year: number; month: number } {
  const [y, m] = iso.split('-').map(Number);
  return {
    year: Number.isFinite(y) ? (y ?? 0) : 0,
    month: Number.isFinite(m) && m !== undefined && m >= 1 && m <= 12 ? m : 1,
  };
}

export function formatLongDate(iso: string): string {
  const { year, month } = parseYearMonth(iso);
  const day = Number(iso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-PK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatMonthYear(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-PK', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatUpcomingDateBox(iso: string): { month: string; day: string } {
  const { year, month } = parseYearMonth(iso);
  const day = Number(iso.slice(8, 10));
  const monthLabel = new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-PK', {
    month: 'short',
    timeZone: 'UTC',
  });
  return { month: monthLabel, day: String(day) };
}

export function eachDayInRange(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    const next = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, (d ?? 1) + 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return days;
}

export function dateInRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export function chunkMonthWeeks(cells: MonthCell[]): MonthCell[][] {
  const weeks: MonthCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export type WeekEventBar = {
  holiday: Holiday;
  startCol: number;
  span: number;
  continuesFromPriorWeek: boolean;
  continuesToNextWeek: boolean;
};

/** Multi-day events as horizontal bars within a calendar week row. */
export function weekEventBars(week: MonthCell[], holidays: Holiday[]): WeekEventBarLane[] {
  const bars: WeekEventBar[] = [];

  for (const holiday of holidays) {
    let startCol = -1;
    let endCol = -1;
    for (let col = 0; col < week.length; col += 1) {
      const cell = week[col];
      if (cell !== undefined && dateInRange(cell.iso, holiday.startDate, holiday.endDate)) {
        if (startCol === -1) {
          startCol = col;
        }
        endCol = col;
      }
    }
    if (startCol === -1 || endCol === -1) {
      continue;
    }
    const firstIso = week[startCol]?.iso ?? holiday.startDate;
    const lastIso = week[endCol]?.iso ?? holiday.endDate;
    bars.push({
      holiday,
      startCol,
      span: endCol - startCol + 1,
      continuesFromPriorWeek: firstIso > holiday.startDate,
      continuesToNextWeek: lastIso < holiday.endDate,
    });
  }

  const sorted = bars.sort(
    (a, b) => a.startCol - b.startCol || a.holiday.name.localeCompare(b.holiday.name),
  );

  const laneEnds: number[] = [];
  return sorted.map((bar) => {
    let lane = 0;
    for (; lane < laneEnds.length; lane += 1) {
      if (bar.startCol > (laneEnds[lane] ?? -1)) {
        break;
      }
    }
    laneEnds[lane] = bar.startCol + bar.span - 1;
    return { ...bar, lane };
  });
}

export type WeekEventBarLane = WeekEventBar & { lane: number };

export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: MonthCell[] = [];

  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonth = prevMonthDate.getUTCMonth() + 1;
  const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();

  for (let index = 0; index < firstDow; index += 1) {
    const day = daysInPrevMonth - firstDow + index + 1;
    const iso = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ iso, day, inCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ iso, day, inCurrentMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const nextIso = addDays(last?.iso ?? `${year}-${String(month).padStart(2, '0')}-01`, 1);
    const parsed = parseYearMonth(nextIso);
    cells.push({
      iso: nextIso,
      day: Number(nextIso.slice(8, 10)),
      inCurrentMonth: parsed.year === year && parsed.month === month,
    });
  }

  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    const nextIso = addDays(last?.iso ?? `${year}-${String(month).padStart(2, '0')}-01`, 1);
    const parsed = parseYearMonth(nextIso);
    cells.push({
      iso: nextIso,
      day: Number(nextIso.slice(8, 10)),
      inCurrentMonth: parsed.year === year && parsed.month === month,
    });
  }

  return cells;
}

export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, (d ?? 1) + delta));
  return next.toISOString().slice(0, 10);
}

export function buildHolidayDayMap(holidays: Holiday[], year: number, month: number): Map<string, Holiday[]> {
  const map = new Map<string, Holiday[]>();

  for (const holiday of holidays) {
    for (const iso of eachDayInRange(holiday.startDate, holiday.endDate)) {
      const parsed = parseYearMonth(iso);
      if (parsed.year !== year || parsed.month !== month) {
        continue;
      }
      const list = map.get(iso) ?? [];
      if (!list.some((entry) => entry.id === holiday.id)) {
        list.push(holiday);
      }
      map.set(iso, list);
    }
  }

  return map;
}

export function holidaysOnDay(holidays: Holiday[], iso: string): Holiday[] {
  return holidays.filter((entry) => dateInRange(iso, entry.startDate, entry.endDate));
}

export function isExamEntry(entry: Holiday): boolean {
  return entry.type === 'EVENT' && /\bexam\b/i.test(entry.name);
}

export function calendarStats(holidays: Holiday[]): {
  total: number;
  holidays: number;
  exams: number;
  other: number;
} {
  let holidayCount = 0;
  let examCount = 0;
  let otherCount = 0;

  for (const entry of holidays) {
    if (entry.type === 'HOLIDAY' || entry.type === 'VACATION') {
      holidayCount += 1;
    } else if (isExamEntry(entry)) {
      examCount += 1;
    } else if (entry.type === 'EVENT') {
      otherCount += 1;
    }
  }

  return {
    total: holidays.length,
    holidays: holidayCount,
    exams: examCount,
    other: otherCount,
  };
}

export function eventCategory(entry: Holiday): { label: string; tone: CategoryTone } {
  if (entry.type === 'HOLIDAY' || entry.type === 'VACATION') {
    return { label: 'Holiday', tone: 'warning' };
  }
  if (isExamEntry(entry)) {
    return { label: 'Exam', tone: 'info' };
  }
  if (/\b(meeting|ptm|parent)/i.test(entry.name)) {
    return { label: 'Meeting', tone: 'info' };
  }
  if (entry.type === 'EVENT') {
    return { label: 'Academic', tone: 'success' };
  }
  return { label: 'Academic', tone: 'neutral' };
}

export function formatCompactDate(iso: string): string {
  const { year, month } = parseYearMonth(iso);
  const day = Number(iso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function eventVisualTheme(entry: Holiday): {
  label: string;
  tone: CategoryTone;
  dateBlockClass: string;
  iconShellClass: string;
  iconDotClass: string;
} {
  const category = eventCategory(entry);
  const colors = holidayColorTheme(entry);
  return {
    ...category,
    dateBlockClass: colors.dateBlock,
    iconShellClass: colors.iconShell,
    iconDotClass: colors.iconDot,
  };
}

export function eventPillClass(entry: Holiday): string {
  return eventBarClass(entry);
}

export function eventBarClass(entry: Holiday): string {
  if (entry.type === 'HOLIDAY') {
    return 'bg-danger/15 text-danger border-danger/20';
  }
  if (entry.type === 'VACATION' || isExamEntry(entry)) {
    return 'bg-primary/15 text-primary border-primary/20';
  }
  if (/\b(meeting|ptm|staff)/i.test(entry.name)) {
    return 'bg-info/15 text-info border-info/20';
  }
  return 'bg-success/15 text-success border-success/20';
}

/** Full-cell tint for days that carry an event. */
export function eventCellBackgroundClass(entry: Holiday): string {
  return holidayColorTheme(entry).cellBg;
}

export function primaryEventForDay(iso: string, holidays: Holiday[]): Holiday | undefined {
  const onDay = holidaysOnDay(holidays, iso);
  if (onDay.length === 0) {
    return undefined;
  }

  const priority = (entry: Holiday): number => {
    if (entry.type === 'HOLIDAY') {
      return 0;
    }
    if (entry.type === 'VACATION') {
      return 1;
    }
    if (isExamEntry(entry)) {
      return 2;
    }
    return 3;
  };

  return [...onDay].sort((a, b) => priority(a) - priority(b) || a.name.localeCompare(b.name))[0];
}

export function audienceLabel(appliesTo: Holiday['appliesTo']): string {
  if (appliesTo === 'ALL') {
    return 'All classes';
  }
  if (appliesTo === 'STUDENTS') {
    return 'Students only';
  }
  return 'Staff only';
}

export function formatEventWhen(entry: Holiday): string {
  if (entry.startDate === entry.endDate) {
    return formatLongDate(entry.startDate);
  }
  return `${formatLongDate(entry.startDate)} – ${formatLongDate(entry.endDate)}`;
}

export function upcomingHolidays(holidays: Holiday[], fromDate: string, limit = 6): Holiday[] {
  return holidays
    .filter((entry) => entry.endDate >= fromDate)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
    .slice(0, limit);
}

export function weekContaining(iso: string): string[] {
  const date = new Date(`${iso}T12:00:00.000Z`);
  const dow = date.getUTCDay();
  const start = addDays(iso, -dow);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
}
