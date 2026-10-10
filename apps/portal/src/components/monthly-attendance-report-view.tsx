'use client';

import { type MonthlyReport, type MonthlyRow } from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  NoResultsState,
  Pagination,
  StatusBadge,
} from '@ilm/ui';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DesignationIcon,
  EmptyIcon,
  ErrorIcon,
  ExportIcon,
  HolidayIcon,
  ICON_SIZE,
  OverdueIcon,
  StudentsIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  AttendanceDayCell,
  AttendanceReportLegend,
  downloadAttendanceCsv,
  formatMonthLabel,
  formatPercent,
  percentToneClass,
  reasonText,
} from '@/components/attendance-report-shared';
import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { useTenantHref } from '@/lib/use-tenant-href';

const PAGE_SIZE = 10;

/** Matches {@link CardTable} header/body cells; sticky trio keeps names visible while days scroll. */
const TABLE_HEAD =
  'px-4 py-3 align-middle text-xs font-medium whitespace-nowrap text-muted-foreground';
const TABLE_CELL = 'px-4 py-3 align-middle text-sm text-foreground';
const TABLE_NUM = 'px-4 py-3 align-middle text-end text-sm font-mono tabular-nums text-foreground';
const STICKY_SHADOW = 'shadow-[4px_0_12px_-6px_hsl(var(--foreground)/0.08)]';
const STICKY_INDEX_HEAD = cn(
  'sticky left-0 z-30 w-14 min-w-14 bg-muted text-center',
  TABLE_HEAD,
);
const STICKY_NAME_HEAD = cn(
  'sticky left-14 z-30 w-52 min-w-52 bg-muted text-start',
  TABLE_HEAD,
);
const STICKY_CODE_HEAD = cn(
  'sticky left-[16.5rem] z-30 w-28 min-w-28 bg-muted text-start',
  TABLE_HEAD,
  STICKY_SHADOW,
);
const STICKY_INDEX_BODY = cn(
  'sticky left-0 z-20 w-14 min-w-14 bg-card text-center font-mono text-xs text-muted-foreground tabular-nums [tr:hover_&]:bg-muted/30',
  TABLE_CELL,
);
const STICKY_NAME_BODY = cn(
  'sticky left-14 z-20 w-52 min-w-52 bg-card text-start font-normal [tr:hover_&]:bg-muted/30',
  TABLE_CELL,
);
const STICKY_CODE_BODY = cn(
  'sticky left-[16.5rem] z-20 w-28 min-w-28 bg-card font-mono text-xs text-muted-foreground tabular-nums [tr:hover_&]:bg-muted/30',
  TABLE_CELL,
  STICKY_SHADOW,
);

export type MonthlyAttendanceReportVariant = 'student' | 'staff';

export interface MonthlyAttendanceReportViewProps {
  variant: MonthlyAttendanceReportVariant;
  report: MonthlyReport;
  basePath: string;
  filters: { month: string; q: string };
  error?: string | undefined;
}

export function MonthlyAttendanceReportView({
  variant,
  report,
  basePath,
  filters,
  error,
}: MonthlyAttendanceReportViewProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const [offset, setOffset] = useState(0);

  const config = VARIANT_CONFIG[variant];
  const summary = useMemo(() => aggregateSummary(report, variant), [report, variant]);
  const pageRows = report.rows.slice(offset, offset + PAGE_SIZE);
  const classTitle =
    variant === 'staff' ? 'Staff' : report.title === '' ? 'Class' : report.title;
  const isFiltered = filters.q.trim() !== '';

  useEffect(() => {
    setSearchDraft(filters.q);
  }, [filters.q]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchDraft === filters.q) {
        return;
      }
      const query = new URLSearchParams();
      query.set('month', filters.month);
      if (searchDraft !== '') {
        query.set('q', searchDraft);
      }
      router.push(tenantHref(`${basePath}?${query.toString()}`));
    }, 350);
    return () => {
      window.clearTimeout(handle);
    };
  }, [searchDraft, filters.q, filters.month, basePath, router, tenantHref]);

  function navigateMonth(delta: number): void {
    router.push(
      tenantHref(`${basePath}?${buildQuery(shiftMonth(filters.month, delta), filters.q)}`),
    );
  }

  function exportCsv(): void {
    downloadAttendanceCsv(report, config.codeLabelShort, {
      summaryHeaders: config.csvSummaryHeaders,
      summaryValues: (row) => config.csvSummaryValues(row),
    });
  }

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title={config.pageTitle(classTitle)}
        description={
          <>
            {config.pageDescription}
            <span className="mt-1 block text-sm text-muted-foreground">
              {formatMonthLabel(report.month)} · {report.workingDays} working{' '}
              {report.workingDays === 1 ? 'day' : 'days'}
            </span>
          </>
        }
      />

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className={cn('grid gap-3', config.summaryGridClass)}>
        <SummaryTile
          label={config.totalLabel}
          value={String(summary.totalPeople)}
          icon={config.totalIcon}
          iconClassName="bg-primary/10 text-primary"
        />
        <SummaryTile
          label="Present"
          value={String(summary.present)}
          badge={summary.shareLabel(summary.present)}
          icon={SuccessIcon}
          iconClassName="bg-success/10 text-success"
          badgeClassName="bg-success/10 text-success"
        />
        <SummaryTile
          label="Absent"
          value={String(summary.absent)}
          badge={summary.shareLabel(summary.absent)}
          icon={ErrorIcon}
          iconClassName="bg-danger/10 text-danger"
          badgeClassName="bg-danger/10 text-danger"
        />
        {config.showLateCard ? (
          <SummaryTile
            label="Late"
            value={String(summary.late)}
            badge={summary.shareLabel(summary.late)}
            icon={OverdueIcon}
            iconClassName="bg-warning/15 text-warning"
            badgeClassName="bg-warning/15 text-warning"
          />
        ) : null}
        <SummaryTile
          label="Leave"
          value={String(summary.leave)}
          badge={summary.shareLabel(summary.leave)}
          icon={HolidayIcon}
          iconClassName="bg-primary/10 text-primary"
          badgeClassName="bg-primary/10 text-primary"
        />
        <SummaryTile
          label="Not marked"
          value={String(summary.notMarked)}
          badge={summary.shareLabel(summary.notMarked)}
          icon={EmptyIcon}
          iconClassName="bg-muted text-muted-foreground"
          badgeClassName="bg-muted text-muted-foreground"
        />
      </div>

      <ListPageToolbar
        searchQuery={searchDraft}
        onSearchQueryChange={(value) => {
          setSearchDraft(value);
          setOffset(0);
        }}
        searchPlaceholder={config.searchPlaceholder}
        searchAriaLabel={config.searchAriaLabel}
        filters={
          <>
            <div className="hidden shrink-0 lg:block">
              <AttendanceReportLegend
                compact
                hideLate={!config.showLateCard}
                hideSchoolClosed
              />
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1 shadow-raised">
              <Button
                type="button"
                tone="ghost"
                size="sm"
                aria-label="Previous month"
                onClick={() => {
                  navigateMonth(-1);
                }}
              >
                <ChevronLeftIcon className={ICON_SIZE.inline} aria-hidden="true" />
              </Button>
              <span className="min-w-28 px-2 text-center text-sm font-medium text-foreground">
                {formatMonthLabel(filters.month)}
              </span>
              <Button
                type="button"
                tone="ghost"
                size="sm"
                aria-label="Next month"
                onClick={() => {
                  navigateMonth(1);
                }}
              >
                <ChevronRightIcon className={ICON_SIZE.inline} aria-hidden="true" />
              </Button>
            </div>
            <Button
              type="button"
              tone="outline"
              className="w-full sm:w-auto"
              disabled={report.rows.length === 0}
              onClick={exportCsv}
            >
              <ExportIcon className={ICON_SIZE.inline} aria-hidden="true" />
              Export CSV
            </Button>
          </>
        }
      />

      <AttendanceReportLegend
        compact
        hideLate={!config.showLateCard}
        hideSchoolClosed
        className="lg:hidden"
      />

      <Card className="w-full overflow-hidden rounded-lg shadow-raised">
        <CardHeader className="flex flex-row items-start justify-between gap-3 bg-card px-4 pb-2 pt-4 sm:px-6">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base font-semibold text-foreground">
              Attendance register
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {report.rows.length}{' '}
              {report.rows.length === 1 ? config.personSingular : config.personPlural}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {report.rows.length === 0 ? (
            isFiltered ? (
              <NoResultsState
                className="border-0 shadow-none"
                onClearFilters={() => {
                  setSearchDraft('');
                  router.push(tenantHref(`${basePath}?${buildQuery(filters.month, '')}`));
                }}
              />
            ) : (
              <EmptyState
                title="Nothing for this month"
                description={config.emptyHint}
                className="border-0 shadow-none"
              />
            )
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden">
                {pageRows.map((row, index) => (
                  <MobileReportRow
                    key={row.subjectId}
                    row={row}
                    index={offset + index + 1}
                    variant={variant}
                  />
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[72rem] border-collapse text-sm">
                  <caption className="sr-only">
                    {classTitle} attendance, {formatMonthLabel(report.month)}
                  </caption>
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th scope="col" className={STICKY_INDEX_HEAD}>
                        #
                      </th>
                      <th scope="col" className={STICKY_NAME_HEAD}>
                        {config.nameColumnLabel}
                      </th>
                      <th scope="col" className={STICKY_CODE_HEAD}>
                        {config.codeColumnLabel}
                      </th>
                      {report.days.map((day) => (
                        <th
                          key={day.date}
                          scope="col"
                          title={day.isWorkingDay ? weekdayLabel(day.date) : reasonText(day)}
                          className={cn(
                            'w-11 min-w-11 px-1 py-3 align-middle text-center',
                            TABLE_HEAD,
                            day.isWorkingDay ? 'bg-muted/30' : 'bg-muted/60',
                          )}
                        >
                          <span className="block text-foreground">
                            {Number(day.date.slice(8))}
                          </span>
                          <span className="block text-[10px] font-normal uppercase">
                            {weekdayShort(day.date)}
                          </span>
                        </th>
                      ))}
                      <th scope="col" className={cn(TABLE_HEAD, 'text-end')}>
                        Present
                      </th>
                      <th scope="col" className={cn(TABLE_HEAD, 'text-end')}>
                        Absent
                      </th>
                      {config.showLateColumn ? (
                        <th scope="col" className={cn(TABLE_HEAD, 'text-end')}>
                          Late
                        </th>
                      ) : null}
                      <th scope="col" className={cn(TABLE_HEAD, 'text-end')}>
                        Leave
                      </th>
                      <th scope="col" className={cn(TABLE_HEAD, 'text-end')}>
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, index) => (
                      <ReportRow
                        key={row.subjectId}
                        row={row}
                        index={offset + index + 1}
                        days={report.days}
                        variant={variant}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {report.rows.length > PAGE_SIZE ? (
                <div className="border-t border-border px-4 py-3 sm:px-6">
                  <Pagination
                    total={report.rows.length}
                    limit={PAGE_SIZE}
                    offset={offset}
                    label={config.personPlural}
                    onChange={setOffset}
                    className="border-t-0 px-0 pt-0"
                  />
                </div>
              ) : (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground sm:px-6">
                  Showing {report.rows.length === 0 ? 0 : 1}–{report.rows.length} of{' '}
                  {report.rows.length} {config.personPlural}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** @deprecated Import {@link MonthlyAttendanceReportView} with `variant="student"`. */
export function StudentAttendanceReportView(
  props: Omit<MonthlyAttendanceReportViewProps, 'variant'>,
) {
  return <MonthlyAttendanceReportView {...props} variant="student" />;
}

function ReportRow({
  row,
  index,
  days,
  variant,
}: {
  row: MonthlyRow;
  index: number;
  days: MonthlyReport['days'];
  variant: MonthlyAttendanceReportVariant;
}) {
  const config = VARIANT_CONFIG[variant];
  const counts = rowStatusCounts(row, variant);
  const { firstName, lastName } = splitName(row.name);

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30">
      <td className={STICKY_INDEX_BODY}>{index}</td>
      <th scope="row" className={STICKY_NAME_BODY}>
        <span className="flex min-w-0 items-center gap-2.5">
          {config.showAvatar ? (
            <StudentAdmissionAvatar
              firstName={firstName}
              lastName={lastName}
              photoUrl={row.photoUrl ?? null}
              className="size-9 text-xs"
            />
          ) : (
            <StaffInitialAvatar name={row.name} />
          )}
          <span className="truncate font-medium text-foreground">{row.name}</span>
        </span>
      </th>
      <td className={STICKY_CODE_BODY}>{row.code}</td>
      {days.map((day) => {
        const mark = row.days[String(Number(day.date.slice(8)))];
        return (
          <td
            key={day.date}
            className={cn(
              'px-1 py-3 align-middle text-center',
              day.isWorkingDay ? '' : 'bg-muted/60',
            )}
          >
            <AttendanceDayCell mark={mark} closed={!day.isWorkingDay} />
          </td>
        );
      })}
      <td className={TABLE_NUM}>{counts.present}</td>
      <td className={TABLE_NUM}>{counts.absent}</td>
      {config.showLateColumn ? <td className={TABLE_NUM}>{counts.late}</td> : null}
      <td className={TABLE_NUM}>{counts.leave}</td>
      <td
        className={cn(
          TABLE_NUM,
          'font-medium',
          percentToneClass(row.percentBasisPoints, row.expectedDays),
        )}
      >
        {row.expectedDays === 0 ? '—' : formatPercent(row.percentBasisPoints)}
      </td>
    </tr>
  );
}

function MobileReportRow({
  row,
  index,
  variant,
}: {
  row: MonthlyRow;
  index: number;
  variant: MonthlyAttendanceReportVariant;
}) {
  const config = VARIANT_CONFIG[variant];
  const counts = rowStatusCounts(row, variant);
  const { firstName, lastName } = splitName(row.name);

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{index}</span>
        {config.showAvatar ? (
          <StudentAdmissionAvatar
            firstName={firstName}
            lastName={lastName}
            photoUrl={row.photoUrl ?? null}
            className="size-9 text-xs"
          />
        ) : (
          <StaffInitialAvatar name={row.name} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
        </div>
        <span
          className={cn(
            'font-mono text-sm font-medium tabular-nums',
            percentToneClass(row.percentBasisPoints, row.expectedDays),
          )}
        >
          {row.expectedDays === 0 ? '—' : formatPercent(row.percentBasisPoints)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Present {counts.present} · Absent {counts.absent}
        {config.showLateColumn ? ` · Late ${counts.late}` : ''} · Leave {counts.leave}
      </p>
    </li>
  );
}

function StaffInitialAvatar({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
      : (parts[0]?.slice(0, 2) ?? '??').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-border"
    >
      {initials}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  badge,
  icon: Icon,
  iconClassName,
  badgeClassName,
}: {
  label: string;
  value: string;
  badge?: string;
  icon: typeof StudentsIcon;
  iconClassName: string;
  badgeClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-raised">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconClassName)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p>
          {badge === undefined ? null : (
            <StatusBadge tone="neutral" size="sm" className={badgeClassName}>
              {badge}
            </StatusBadge>
          )}
        </div>
      </div>
    </div>
  );
}

const VARIANT_CONFIG = {
  student: {
    pageTitle: (className: string) => `${className} — Attendance Report`,
    pageDescription: 'View daily attendance for all students in this class',
    totalLabel: 'Total students',
    totalIcon: StudentsIcon,
    personSingular: 'student',
    personPlural: 'students',
    nameColumnLabel: 'Student',
    codeColumnLabel: 'GR No.',
    codeLabelShort: 'GR',
    searchPlaceholder: 'Search student by name or GR number…',
    searchAriaLabel: 'Search students in attendance report',
    emptyHint: 'Nobody was enrolled in this month, or the search matched no one.',
    showAvatar: true,
    showLateCard: false,
    showLateColumn: false,
    summaryGridClass: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    csvSummaryHeaders: ['Present', 'Absent', 'Leave', 'Attendance %'] as const,
    csvSummaryValues: (row: MonthlyRow) => {
      const counts = rowStatusCounts(row, 'student');
      return [
        String(counts.present),
        String(counts.absent),
        String(counts.leave),
        row.expectedDays === 0 ? '' : (row.percentBasisPoints / 100).toFixed(2),
      ];
    },
  },
  staff: {
    pageTitle: () => 'Staff — Attendance Report',
    pageDescription: 'View daily attendance for all staff members',
    totalLabel: 'Total staff',
    totalIcon: DesignationIcon,
    personSingular: 'member',
    personPlural: 'staff',
    nameColumnLabel: 'Staff member',
    codeColumnLabel: 'Emp No.',
    codeLabelShort: 'Emp',
    searchPlaceholder: 'Search by name or employee number…',
    searchAriaLabel: 'Search staff in attendance report',
    emptyHint: 'No staff matched this month, or the search matched no one.',
    showAvatar: false,
    showLateCard: true,
    showLateColumn: true,
    summaryGridClass: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
    csvSummaryHeaders: ['Present', 'Absent', 'Late', 'Leave', 'Attendance %'] as const,
    csvSummaryValues: (row: MonthlyRow) => {
      const counts = rowStatusCounts(row, 'staff');
      return [
        String(counts.present),
        String(counts.absent),
        String(counts.late),
        String(counts.leave),
        row.expectedDays === 0 ? '' : (row.percentBasisPoints / 100).toFixed(2),
      ];
    },
  },
} as const satisfies Record<
  MonthlyAttendanceReportVariant,
  {
    pageTitle: (className: string) => string;
    pageDescription: string;
    totalLabel: string;
    totalIcon: typeof StudentsIcon;
    personSingular: string;
    personPlural: string;
    nameColumnLabel: string;
    codeColumnLabel: string;
    codeLabelShort: string;
    searchPlaceholder: string;
    searchAriaLabel: string;
    emptyHint: string;
    showAvatar: boolean;
    showLateCard: boolean;
    showLateColumn: boolean;
    summaryGridClass: string;
    csvSummaryHeaders: readonly string[];
    csvSummaryValues: (row: MonthlyRow) => readonly string[];
  }
>;

function aggregateSummary(report: MonthlyReport, variant: MonthlyAttendanceReportVariant) {
  let present = 0;
  let absent = 0;
  let late = 0;
  let leave = 0;
  let notMarked = 0;

  for (const row of report.rows) {
    const counts = rowStatusCounts(row, variant);
    present += counts.present;
    absent += counts.absent;
    late += counts.late;
    leave += counts.leave;
    notMarked += notMarkedDays(row, report.days);
  }

  const totalMarks =
    present + absent + leave + notMarked + (variant === 'staff' ? late : 0);

  return {
    totalPeople: report.rows.length,
    present,
    absent,
    late,
    leave,
    notMarked,
    shareLabel: (count: number) =>
      totalMarks === 0 ? '0%' : `${((count / totalMarks) * 100).toFixed(1)}%`,
  };
}

function rowStatusCounts(row: MonthlyRow, variant: MonthlyAttendanceReportVariant) {
  const values = Object.values(row.days);
  if (variant === 'staff') {
    return {
      present: values.filter((s) => s === 'PRESENT' || s === 'HALF_DAY').length,
      absent: values.filter((s) => s === 'ABSENT').length,
      late: values.filter((s) => s === 'LATE').length,
      leave: values.filter((s) => s === 'SICK_LEAVE' || s === 'CASUAL_LEAVE').length,
    };
  }
  return {
    present: values.filter((s) => s === 'PRESENT' || s === 'LATE' || s === 'HALF_DAY').length,
    absent: values.filter((s) => s === 'ABSENT').length,
    late: values.filter((s) => s === 'LATE').length,
    leave: values.filter((s) => s === 'LEAVE' || s === 'EXCUSED').length,
  };
}

function notMarkedDays(row: MonthlyRow, days: MonthlyReport['days']): number {
  const marked = days.filter(
    (day) => day.isWorkingDay && row.days[String(Number(day.date.slice(8)))] !== undefined,
  ).length;
  return Math.max(0, row.expectedDays - marked);
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0] ?? '', lastName: '' };
  }
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

function weekdayShort(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function weekdayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

function shiftMonth(monthKey: string, delta: number): string {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildQuery(month: string, q: string): string {
  const params = new URLSearchParams({ month });
  if (q !== '') {
    params.set('q', q);
  }
  return params.toString();
}
