'use client';

import { type MonthlyReport } from '@ilm/contracts';
import { Button, cn, Field, Input, MonthPicker } from '@ilm/ui';
import { ExportIcon, ICON_SIZE, SearchIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

/**
 * A month of attendance, as a grid.
 *
 * ## The thing the reference screen gets wrong
 *
 * It prints a red "A" in every column, including days that have not happened,
 * and then reports 0.00% for everyone. Two different mistakes with the same
 * cause: no distinction between *absent* and *no register taken*.
 *
 * Here they are different marks. A day with no record is a dash, a closed day
 * is greyed with its reason in the tooltip, and the percentage divides by the
 * days that person could actually have attended — so a child admitted on the
 * 20th who never missed a day reads 100%, not 35%.
 *
 * ## Why the grid scrolls rather than shrinking
 *
 * Thirty-one columns plus a name will not fit a phone, and squeezing them makes
 * every cell unreadable. The name column is sticky and the days scroll, which
 * keeps the one column you need to read against the ones you are scanning.
 */

export interface AttendanceMonthGridProps {
  report: MonthlyReport;
  basePath: string;
  filters: { month: string; q: string };
  heading: string;
  /** "GR" for students, "Emp" for staff. */
  codeLabel: string;
  error?: string | undefined;
}

export function AttendanceMonthGrid({
  report,
  basePath,
  filters,
  heading,
  codeLabel,
  error,
}: AttendanceMonthGridProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(filters);

  function apply(next: Partial<typeof filters>) {
    const merged = { ...draft, ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '') {
        query.set(key, value);
      }
    }
    router.push(`${basePath}?${query.toString()}`);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMonth(report.month)} · {report.workingDays} working{' '}
            {report.workingDays === 1 ? 'day' : 'days'} · {report.rows.length}{' '}
            {report.rows.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <Button
          type="button"
          tone="outline"
          onClick={() => {
            downloadCsv(report, codeLabel);
          }}
          disabled={report.rows.length === 0}
        >
          <ExportIcon className={ICON_SIZE.inline} aria-hidden />
          Export CSV
        </Button>
      </header>

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          apply({});
        }}
      >
        <div className="min-w-56 flex-1">
          <Field label="Search">
            <div className="relative">
              <Input
                value={draft.q}
                placeholder="Name or number"
                onChange={(event) => {
                  setDraft({ ...draft, q: event.target.value });
                }}
              />
              <SearchIcon
                className={`${ICON_SIZE.inline} pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground`}
                aria-hidden
              />
            </div>
          </Field>
        </div>
        <div className="w-44">
          <Field label="Month">
            <MonthPicker
              value={draft.month}
              onChange={(nextValue) => {
                setDraft({ ...draft, month: nextValue });
                apply({ month: nextValue });
              }}
            />
          </Field>
        </div>
        <Button type="submit" tone="outline">
          Apply
        </Button>
      </form>

      <Legend />

      {report.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium text-foreground">Nothing for this month</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nobody was enrolled in this month, or the search matched no one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              {heading}, {formatMonth(report.month)}
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  Name
                </th>
                <th scope="col" className="px-2 py-2 text-left font-medium whitespace-nowrap">
                  {codeLabel}
                </th>
                {report.days.map((day) => (
                  <th
                    key={day.date}
                    scope="col"
                    title={day.isWorkingDay ? undefined : reasonText(day)}
                    className={cn(
                      'w-8 px-0 py-2 text-center text-xs font-medium',
                      day.isWorkingDay
                        ? 'text-muted-foreground'
                        : 'bg-muted/60 text-muted-foreground/60',
                    )}
                  >
                    {Number(day.date.slice(8))}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  Present
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  Attendance
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.subjectId} className="border-b border-border/60 last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-48 truncate bg-card px-3 py-1.5 text-left font-medium"
                  >
                    {row.name}
                  </th>
                  <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
                    {row.code}
                  </td>
                  {report.days.map((day) => {
                    const mark = row.days[String(Number(day.date.slice(8)))];
                    return (
                      <td
                        key={day.date}
                        className={cn(
                          'px-0 py-1.5 text-center',
                          day.isWorkingDay ? '' : 'bg-muted/60',
                        )}
                      >
                        <Cell mark={mark} closed={!day.isWorkingDay} />
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {row.present}
                    <span className="text-muted-foreground">/{row.expectedDays}</span>
                  </td>
                  <td
                    className={cn(
                      'px-3 py-1.5 text-right font-mono font-medium tabular-nums',
                      percentTone(row.percentBasisPoints, row.expectedDays),
                    )}
                  >
                    {row.expectedDays === 0 ? '—' : formatPercent(row.percentBasisPoints)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * One cell.
 *
 * A dash is "no register taken", which is not the same as absent — and telling
 * those apart is the whole point of this grid.
 */
function Cell({ mark, closed }: { mark: string | undefined; closed: boolean }) {
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

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {['PRESENT', 'ABSENT', 'LATE', 'LEAVE'].map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            className={cn(
              'inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold',
              TONES[status] ?? '',
            )}
          >
            {SHORT[status]}
          </span>
          {LABELS[status]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-flex size-4 items-center justify-center">·</span>
        Not marked
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block size-4 rounded bg-muted/60" />
        School closed
      </li>
    </ul>
  );
}

function percentTone(basisPoints: number, expected: number): string {
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

/** Basis points to a percentage string. 9231 reads as 92.31%. */
function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

function reasonText(day: MonthlyReport['days'][number]): string {
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

function formatMonth(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The month, as a file.
 *
 * Built in the browser from data already on the page rather than through
 * another endpoint: the report is at most a few hundred rows, and a second
 * server round trip could return something subtly different from what is on
 * screen — which is the thing an export must never do.
 */
function downloadCsv(report: MonthlyReport, codeLabel: string): void {
  const header = [
    'Name',
    codeLabel,
    ...report.days.map((day) => String(Number(day.date.slice(8)))),
    'Present',
    'Expected',
    'Attendance %',
  ];

  const rows = report.rows.map((row) => [
    row.name,
    row.code,
    ...report.days.map((day) => row.days[String(Number(day.date.slice(8)))] ?? ''),
    String(row.present),
    String(row.expectedDays),
    row.expectedDays === 0 ? '' : (row.percentBasisPoints / 100).toFixed(2),
  ]);

  const csv = [header, ...rows].map((line) => line.map(escapeCsv).join(',')).join('\r\n');

  // A BOM, so Excel opens a name with non-ASCII characters correctly instead of
  // rendering it as mojibake — which is most of a Pakistani register.
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
