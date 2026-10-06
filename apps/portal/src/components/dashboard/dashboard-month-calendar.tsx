'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from '@ilm/ui';
import { ChevronLeftIcon, ChevronRightIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type CalendarHoliday = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: string;
};

type CalendarEvent = {
  id: string;
  date: string;
  title: string;
  time?: string;
};

type DashboardMonthCalendarProps = {
  today: string;
  holidays: CalendarHoliday[];
  events?: CalendarEvent[];
  calendarHref?: string;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function DashboardMonthCalendar({
  today,
  holidays,
  events = [],
  calendarHref,
}: DashboardMonthCalendarProps) {
  const initial = parseYearMonth(today);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);

  const holidayDays = useMemo(() => buildHolidayDayMap(holidays, year, month), [holidays, month, year]);
  const eventDays = useMemo(() => buildEventDayMap(events, year, month), [events, month, year]);
  const monthEvents = useMemo(
    () => eventsInMonth(events, year, month).slice(0, 2),
    [events, month, year],
  );

  const cells = useMemo(() => buildMonthCells(year, month), [month, year]);

  function shiftMonth(delta: number): void {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  }

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-PK', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Card className="flex h-full w-full flex-col rounded-2xl shadow-raised">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-0 px-4 pb-0 pt-4 sm:px-6">
        <div className="min-w-0">
          <CardTitle>Calendar</CardTitle>
          <CardDescription className="hidden sm:block">Events and holidays this session.</CardDescription>
        </div>
        {calendarHref === undefined ? null : (
          <Link href={calendarHref} className="text-xs font-medium text-primary hover:underline">
            Manage
          </Link>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-2 sm:px-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => {
              shiftMonth(-1);
            }}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </button>
          <p className="text-sm font-semibold text-foreground">{monthLabel}</p>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => {
              shiftMonth(1);
            }}
            className="inline-flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-muted-foreground">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-0.5">
              {day}
            </div>
          ))}
        </div>

        <div className="mt-0.5 grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-0.5">
          {cells.map((cell) => {
            const key = `${cell.iso ?? 'blank'}-${cell.index}`;
            if (cell.iso === null) {
              return <div key={key} className="min-h-7 h-full" aria-hidden="true" />;
            }

            const marks = holidayDays.get(cell.iso) ?? [];
            const dayEvents = eventDays.get(cell.iso) ?? [];
            const isToday = cell.iso === today;
            const hasMark = marks.length > 0 || dayEvents.length > 0;
            const title = [...dayEvents.map((entry) => entry.title), ...marks.map((entry) => entry.name)].join(
              ', ',
            );

            return (
              <div
                key={key}
                className={cn(
                  'relative flex h-full min-h-7 flex-col items-center justify-center rounded-md text-xs',
                  isToday ? 'bg-primary/15 font-semibold text-primary' : 'text-foreground',
                  hasMark && !isToday ? 'bg-muted/50' : undefined,
                )}
                title={title === '' ? undefined : title}
              >
                {cell.day}
                {hasMark ? (
                  <span className="mt-0.5 flex gap-0.5">
                    {dayEvents.slice(0, 2).map((entry) => (
                      <span key={entry.id} aria-hidden="true" className="size-1 rounded-full bg-primary" />
                    ))}
                    {marks.slice(0, 3 - Math.min(dayEvents.length, 2)).map((mark) => (
                      <span
                        key={mark.id}
                        aria-hidden="true"
                        className={cn(
                          'size-1 rounded-full',
                          mark.type === 'HOLIDAY' ? 'bg-primary/60' : 'bg-warning',
                        )}
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <ul className="mt-2 shrink-0 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {monthEvents.length > 0
            ? monthEvents.map((entry) => (
                <li key={entry.id} className="flex justify-between gap-2">
                  <span className="truncate text-foreground">{entry.title}</span>
                  <span className="shrink-0 tabular-nums">{entry.date.slice(5)}</span>
                </li>
              ))
            : holidays
                .filter((entry) => monthOverlaps(entry, year, month))
                .slice(0, 4)
                .map((entry) => (
                  <li key={entry.id} className="flex justify-between gap-2">
                    <span className="truncate text-foreground">{entry.name}</span>
                    <span className="shrink-0 tabular-nums">{entry.startDate.slice(5)}</span>
                  </li>
                ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function parseYearMonth(iso: string): { year: number; month: number } {
  const [y, m] = iso.split('-').map(Number);
  return { year: y ?? new Date().getFullYear(), month: m ?? 1 };
}

function buildMonthCells(year: number, month: number): { iso: string | null; day: number; index: number }[] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: { iso: string | null; day: number; index: number }[] = [];

  for (let index = 0; index < firstDow; index += 1) {
    cells.push({ iso: null, day: 0, index });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ iso, day, index: cells.length });
  }

  return cells;
}

function buildEventDayMap(
  events: CalendarEvent[],
  year: number,
  month: number,
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const parsed = parseYearMonth(event.date);
    if (parsed.year !== year || parsed.month !== month) {
      continue;
    }
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  return map;
}

function eventsInMonth(events: CalendarEvent[], year: number, month: number): CalendarEvent[] {
  return events
    .filter((entry) => {
      const parsed = parseYearMonth(entry.date);
      return parsed.year === year && parsed.month === month;
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function buildHolidayDayMap(
  holidays: CalendarHoliday[],
  year: number,
  month: number,
): Map<string, CalendarHoliday[]> {
  const map = new Map<string, CalendarHoliday[]>();

  for (const holiday of holidays) {
    if (!monthOverlaps(holiday, year, month)) {
      continue;
    }
    for (const iso of eachDayInRange(holiday.startDate, holiday.endDate)) {
      const parsed = parseYearMonth(iso);
      if (parsed.year !== year || parsed.month !== month) {
        continue;
      }
      const list = map.get(iso) ?? [];
      list.push(holiday);
      map.set(iso, list);
    }
  }

  return map;
}

function monthOverlaps(holiday: CalendarHoliday, year: number, month: number): boolean {
  const start = parseYearMonth(holiday.startDate);
  const end = parseYearMonth(holiday.endDate);
  const monthStart = year * 12 + (month - 1);
  const rangeStart = start.year * 12 + (start.month - 1);
  const rangeEnd = end.year * 12 + (end.month - 1);
  return monthStart >= rangeStart && monthStart <= rangeEnd;
}

function eachDayInRange(start: string, end: string): string[] {
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
