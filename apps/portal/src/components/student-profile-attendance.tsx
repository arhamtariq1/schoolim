'use client';

import { ROUTES, type MonthlyReport } from '@ilm/contracts';
import { Card, CardContent, CardHeader, CardTitle, cn, EmptyState, MonthPicker } from '@ilm/ui';
import { CalendarIcon } from '@ilm/ui/icons';
import { useEffect, useMemo, useState } from 'react';

import { fetchJson } from '@/lib/mutate';

function currentMonthKey(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string): string {
  return new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
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

export function StudentProfileAttendancePanel({
  studentId,
  classLevelId,
  className,
  sessionId,
}: {
  studentId: string;
  classLevelId: string | undefined;
  className: string | undefined;
  sessionId: string | undefined;
}) {
  const [month, setMonth] = useState(currentMonthKey);
  const [report, setReport] = useState<MonthlyReport | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (classLevelId === undefined) {
      setReport(undefined);
      setError(undefined);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(undefined);

    const params = new URLSearchParams({ month });
    if (sessionId !== undefined) {
      params.set('sessionId', sessionId);
    }

    void fetchJson<{ data: MonthlyReport }>(
      `${ROUTES.attendance.studentReport(classLevelId)}?${params.toString()}`,
    )
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.ok) {
          setReport(undefined);
          setError(result.message);
          return;
        }
        setReport(result.data.data);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setReport(undefined);
        setError(cause instanceof Error ? cause.message : 'Attendance could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [classLevelId, month, sessionId]);

  const row = useMemo(
    () => report?.rows.find((entry) => entry.subjectId === studentId),
    [report, studentId],
  );

  if (classLevelId === undefined) {
    return (
      <EmptyState
        title="No class enrolment"
        description="Enrol this student in a class to see their attendance register."
      />
    );
  }

  return (
    <Card className="shadow-raised">
      <CardHeader className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarIcon className="size-5 text-primary" aria-hidden="true" />
            Attendance
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {className ?? 'Class'} · {formatMonthLabel(month)}
          </p>
        </div>
        <MonthPicker value={month} onChange={setMonth} aria-label="Attendance month" />
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading attendance…</p>
        ) : error !== undefined ? (
          <p className="text-sm text-danger">{error}</p>
        ) : report === undefined || row === undefined ? (
          <EmptyState
            title="No register for this month"
            description="Attendance has not been marked yet, or this student was not enrolled during this month."
          />
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-4">
              <Stat label="Present" value={String(row.present)} />
              <Stat label="Absent" value={String(row.absent)} />
              <Stat label="Leave" value={String(row.leave)} />
              <Stat
                label="Attendance"
                value={row.expectedDays === 0 ? '—' : formatPercent(row.percentBasisPoints)}
              />
            </dl>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    {report.days.map((day) => (
                      <th key={day.date} className="px-1 py-2 font-medium">
                        {String(Number(day.date.slice(8)))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {report.days.map((day) => {
                      const mark = row.days[String(Number(day.date.slice(8)))];
                      return (
                        <td
                          key={day.date}
                          className={cn(
                            'px-0 py-2 text-center',
                            day.isWorkingDay ? '' : 'bg-muted/60',
                          )}
                        >
                          <AttendanceCell mark={mark} closed={!day.isWorkingDay} />
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              P present · A absent · L late · Lv leave · · not marked · grey days school closed
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function AttendanceCell({ mark, closed }: { mark: string | undefined; closed: boolean }) {
  if (mark === undefined) {
    return <span className="text-muted-foreground/50">{closed ? '' : '·'}</span>;
  }

  const short = SHORT[mark] ?? '?';
  return (
    <span
      className={cn(
        'inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold',
        TONES[mark] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {short}
    </span>
  );
}
