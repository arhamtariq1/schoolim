'use client';

import { type MonthlyReport } from '@ilm/contracts';
import { Button, cn, Field, Input, MonthPicker } from '@ilm/ui';
import { ExportIcon, ICON_SIZE, SearchIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  AttendanceDayCell,
  AttendanceReportLegend,
  downloadAttendanceCsv,
  formatMonthLabel,
  formatPercent,
  percentToneClass,
  reasonText,
} from '@/components/attendance-report-shared';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * A month of attendance, as a grid — staff reports and legacy layout.
 *
 * Student class reports use {@link StudentAttendanceReportView} instead.
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
  const tenantHref = useTenantHref();
  const [draft, setDraft] = useState(filters);

  function apply(next: Partial<typeof filters>) {
    const merged = { ...draft, ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '') {
        query.set(key, value);
      }
    }
    router.push(tenantHref(`${basePath}?${query.toString()}`));
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMonthLabel(report.month)} · {report.workingDays} working{' '}
            {report.workingDays === 1 ? 'day' : 'days'} · {report.rows.length}{' '}
            {report.rows.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <Button
          type="button"
          tone="outline"
          onClick={() => {
            downloadAttendanceCsv(report, codeLabel);
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

      <AttendanceReportLegend />

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
              {heading}, {formatMonthLabel(report.month)}
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
                        <AttendanceDayCell mark={mark} closed={!day.isWorkingDay} />
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
                      percentToneClass(row.percentBasisPoints, row.expectedDays),
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
