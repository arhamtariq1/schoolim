'use client';

import { type MonthlyReport, type MonthlyRow } from '@ilm/contracts';
import { cn } from '@ilm/ui';

export function AttendanceDayCell({
  mark,
  closed,
}: {
  mark: string | undefined;
  closed: boolean;
}) {
  if (mark === undefined) {
    return <span className="text-muted-foreground/50">{closed ? '' : '·'}</span>;
  }

  const short = SHORT[mark] ?? '?';
  return (
    <span
      title={LABELS[mark] ?? mark}
      className={cn(
        'inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold',
        TONES[mark] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {short}
    </span>
  );
}

const SHORT: Readonly<Record<string, string>> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  LEAVE: 'Lv',
  HALF_DAY: 'H',
  EXCUSED: 'E',
  SICK_LEAVE: 'S',
  CASUAL_LEAVE: 'C',
};

const LABELS: Readonly<Record<string, string>> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  LEAVE: 'Leave',
  HALF_DAY: 'Half day',
  EXCUSED: 'Excused',
  SICK_LEAVE: 'Sick leave',
  CASUAL_LEAVE: 'Casual leave',
};

const TONES: Readonly<Record<string, string>> = {
  PRESENT: 'bg-success/15 text-success',
  ABSENT: 'bg-danger/15 text-danger',
  LATE: 'bg-warning/20 text-warning',
  HALF_DAY: 'bg-warning/20 text-warning',
  LEAVE: 'bg-primary/15 text-primary',
  EXCUSED: 'bg-primary/15 text-primary',
  SICK_LEAVE: 'bg-primary/15 text-primary',
  CASUAL_LEAVE: 'bg-primary/15 text-primary',
};

const LEGEND_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const;

export function AttendanceReportLegend({
  compact = false,
  hideLate = false,
  hideNotMarked = false,
  hideSchoolClosed = false,
  className,
}: {
  compact?: boolean;
  hideLate?: boolean;
  hideNotMarked?: boolean;
  hideSchoolClosed?: boolean;
  className?: string;
}) {
  const statuses = hideLate
    ? LEGEND_STATUSES.filter((status) => status !== 'LATE')
    : LEGEND_STATUSES;

  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground',
        compact ? 'justify-end' : '',
        className,
      )}
    >
      {statuses.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex size-3.5 rounded-full',
              LEGEND_DOT[status],
            )}
            aria-hidden="true"
          />
          {LABELS[status]}
        </li>
      ))}
      {hideNotMarked ? null : (
        <li className="flex items-center gap-1.5">
          <span className="inline-flex size-3.5 items-center justify-center text-muted-foreground/60">
            ·
          </span>
          Not marked
        </li>
      )}
      {hideSchoolClosed ? null : (
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-3.5 rounded bg-muted/60" aria-hidden="true" />
          School closed
        </li>
      )}
    </ul>
  );
}

const LEGEND_DOT: Readonly<Record<string, string>> = {
  PRESENT: 'bg-success',
  ABSENT: 'bg-danger',
  LATE: 'bg-warning',
  LEAVE: 'bg-primary',
};

export function percentToneClass(basisPoints: number, expected: number): string {
  if (expected === 0) {
    return 'text-muted-foreground';
  }
  if (basisPoints < 7500) {
    return 'text-danger';
  }
  if (basisPoints < 9000) {
    return 'text-warning';
  }
  return 'text-foreground';
}

export function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

export function formatMonthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function reasonText(day: MonthlyReport['days'][number]): string {
  switch (day.reason) {
    case 'HOLIDAY':
      return day.holidayName ?? 'Holiday';
    case 'WEEKEND':
      return 'School closed';
    case 'FUTURE':
      return 'Not yet';
    default:
      return 'Closed';
  }
}

export function downloadAttendanceCsv(
  report: MonthlyReport,
  codeLabel: string,
  options?: {
    extraHeaders?: readonly string[];
    extraRowValues?: (row: MonthlyRow) => readonly string[];
    summaryHeaders?: readonly string[];
    summaryValues?: (row: MonthlyRow) => readonly string[];
  },
): void {
  const summaryHeaders = options?.summaryHeaders ?? ['Present', 'Expected', 'Attendance %'];
  const header = [
    'Name',
    codeLabel,
    ...(options?.extraHeaders ?? []),
    ...report.days.map((day) => String(Number(day.date.slice(8)))),
    ...summaryHeaders,
  ];

  const rows = report.rows.map((row) => [
    row.name,
    row.code,
    ...(options?.extraRowValues?.(row) ?? []),
    ...report.days.map((day) => row.days[String(Number(day.date.slice(8)))] ?? ''),
    ...(options?.summaryValues?.(row) ?? [
      String(row.present),
      String(row.expectedDays),
      row.expectedDays === 0 ? '' : (row.percentBasisPoints / 100).toFixed(2),
    ]),
  ]);

  const csv = [header, ...rows].map((line) => line.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `attendance-${report.title.toLowerCase().replace(/\s+/g, '-')}-${report.month}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
