'use client';

import {
  ROUTES,
  STAFF_ATTENDANCE_STATUS_LABELS,
  STAFF_ATTENDANCE_STATUS_SHORT,
  STAFF_ROLE_LABELS,
  type MarkResult,
  type StaffAttendanceStatus,
  type StaffRoster,
  type StaffRosterEntry,
  type StaffRole,
} from '@ilm/contracts';
import {
  Button,
  Checkbox,
  cn,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Pagination,
  StatusBadge,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import {
  ChevronDownIcon,
  ErrorIcon,
  LockedIcon,
  DesignationIcon,
  OverdueIcon,
  SuccessIcon,
  WarningIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';

import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import {
  FEE_LIST_SELECT_COLUMN,
  FEE_LIST_TABLE_CELL,
  feeListSelectCheckboxWrap,
  feeListTableHeader,
} from '@/components/fees/fee-list-shared';
import { ListDataTable } from '@/components/list-data-table';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { ListTableScreen } from '@/components/list-table-screen';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

const MARK_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'SICK_LEAVE',
  'CASUAL_LEAVE',
] as const satisfies readonly StaffAttendanceStatus[];

type MarkStatus = (typeof MARK_STATUSES)[number];

const PAGE_SIZE = 8;

type StaffRosterTableRow = {
  readonly member: StaffRosterEntry;
  readonly index: number;
};

export interface StaffAttendanceRosterProps {
  roster: StaffRoster;
  canMark: boolean;
  error?: string | undefined;
}

export function StaffAttendanceRosterView({ roster, canMark, error }: StaffAttendanceRosterProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [marks, setMarks] = useState<Record<string, StaffAttendanceStatus>>(() =>
    Object.fromEntries(roster.staff.map((member) => [member.staffId, member.status ?? 'PRESENT'])),
  );
  const [term, setTerm] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);

  const editable = canMark && roster.isEditable;

  const filtered = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (query === '') {
      return roster.staff;
    }
    return roster.staff.filter(
      (member) =>
        member.name.toLowerCase().includes(query) ||
        member.employeeNo.toLowerCase().includes(query) ||
        (member.email ?? '').toLowerCase().includes(query),
    );
  }, [roster.staff, term]);

  const pageRows = useMemo(() => filtered.slice(offset, offset + PAGE_SIZE), [filtered, offset]);

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((row) => selected.has(row.staffId));

  function toggleSelectAllOnPage(): void {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        for (const row of pageRows) {
          next.delete(row.staffId);
        }
      } else {
        for (const row of pageRows) {
          next.add(row.staffId);
        }
      }
      return next;
    });
  }

  const tableRows = useMemo(
    (): StaffRosterTableRow[] =>
      pageRows.map((member, index) => ({ member, index: offset + index + 1 })),
    [pageRows, offset],
  );

  const columns = useMemo((): CardTableColumn<StaffRosterTableRow>[] => {
    const cols: CardTableColumn<StaffRosterTableRow>[] = [];

    if (editable) {
      cols.push({
        key: 'select',
        label: '',
        ...FEE_LIST_SELECT_COLUMN,
        headerCell: feeListSelectCheckboxWrap(
          <Checkbox
            checked={allPageSelected}
            aria-label="Select all on this page"
            onCheckedChange={() => {
              toggleSelectAllOnPage();
            }}
          />,
        ),
        render: (row) =>
          feeListSelectCheckboxWrap(
            <Checkbox
              checked={selected.has(row.member.staffId)}
              aria-label={`Select ${row.member.name}`}
              onCheckedChange={(checked) => {
                setSelected((current) => {
                  const copy = new Set(current);
                  if (checked === true) {
                    copy.add(row.member.staffId);
                  } else {
                    copy.delete(row.member.staffId);
                  }
                  return copy;
                });
              }}
            />,
            { stopRowClick: true },
          ),
      });
    }

    cols.push(
      {
        key: 'index',
        label: '#',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[4%]',
        align: 'end',
        headerCell: feeListTableHeader('#'),
        render: (row) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{row.index}</span>
        ),
      },
      {
        key: 'staff',
        label: 'Staff',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[28%]',
        headerCell: feeListTableHeader('Staff', DesignationIcon),
        render: (row) => {
          const { firstName, lastName } = splitName(row.member.name);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <StudentAdmissionAvatar
                firstName={firstName}
                lastName={lastName}
                photoUrl={row.member.photoUrl}
                className="size-9 text-[11px]"
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.member.name}</p>
                {row.member.email === null ? null : (
                  <p className="truncate text-xs text-muted-foreground md:hidden">
                    {row.member.email}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        key: 'employeeNo',
        label: 'Emp. no.',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        headerCell: feeListTableHeader('Emp. no.', DesignationIcon),
        render: (row) => (
          <span className="font-mono text-sm tabular-nums">{row.member.employeeNo}</span>
        ),
      },
      {
        key: 'role',
        label: 'Role',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[14%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Role', DesignationIcon),
        render: (row) => {
          const roleLabel =
            row.member.role in STAFF_ROLE_LABELS
              ? STAFF_ROLE_LABELS[row.member.role as StaffRole]
              : roleLabelFallback(row.member.role);
          return (
            <StatusBadge tone="neutral" size="sm">
              {roleLabel}
            </StatusBadge>
          );
        },
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[32%]',
        align: 'end',
        headerCell: feeListTableHeader('Status'),
        render: (row) => (
          <div
            role="radiogroup"
            aria-label={`Attendance for ${row.member.name}`}
            className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
            data-stop-row-click
          >
            {MARK_STATUSES.map((option) => (
              <StatusToggle
                key={option}
                status={option}
                active={(marks[row.member.staffId] ?? 'PRESENT') === option}
                disabled={!editable}
                onSelect={() => {
                  setMarks({ ...marks, [row.member.staffId]: option });
                }}
              />
            ))}
          </div>
        ),
      },
    );

    return cols;
  }, [allPageSelected, editable, marks, selected, toggleSelectAllOnPage]);

  const counts = useMemo(() => {
    const values = Object.values(marks);
    const total = roster.staff.length;
    const present = values.filter(
      (status) => status === 'PRESENT' || status === 'LATE' || status === 'HALF_DAY',
    ).length;
    const absent = values.filter((status) => status === 'ABSENT').length;
    const leave = values.filter(
      (status) => status === 'SICK_LEAVE' || status === 'CASUAL_LEAVE',
    ).length;
    return {
      total,
      present,
      absent,
      leave,
      presentPct: percent(present, total),
      absentPct: percent(absent, total),
      leavePct: percent(leave, total),
    };
  }, [marks, roster.staff.length]);

  function setSelectedStatus(status: StaffAttendanceStatus) {
    const targets =
      selected.size > 0
        ? roster.staff.filter((member) => selected.has(member.staffId))
        : roster.staff;
    setMarks((current) => {
      const next = { ...current };
      for (const member of targets) {
        next[member.staffId] = status;
      }
      return next;
    });
  }

  async function submit() {
    setIsSaving(true);
    const result = await mutate<MarkResult>(ROUTES.attendance.markStaff, 'POST', {
      date: roster.date,
      entries: roster.staff.map((member) => ({
        staffId: member.staffId,
        status: marks[member.staffId] ?? 'PRESENT',
      })),
    });
    setIsSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(`${String(result.data.saved)} marked`);
    router.refresh();
  }

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Mark attendance"
        description={
          <StatusBadge tone="neutral" size="sm">
            Staff
          </StatusBadge>
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

      {roster.day.isWorkingDay ? null : (
        <Notice tone="warning" icon={WarningIcon}>
          {roster.day.reason === 'FUTURE'
            ? 'That day has not happened yet.'
            : `${roster.day.holidayName ?? 'This day'} — not a working day for staff.`}
        </Notice>
      )}

      {roster.lockedReason === null ? null : (
        <Notice tone="muted" icon={LockedIcon}>
          {roster.lockedReason}
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total staff"
          value={String(counts.total)}
          icon={DesignationIcon}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatTile
          label="Present"
          value={String(counts.present)}
          sub={`${counts.presentPct}%`}
          icon={SuccessIcon}
          iconClassName="bg-success/10 text-success"
        />
        <StatTile
          label="Absent"
          value={String(counts.absent)}
          sub={`${counts.absentPct}%`}
          icon={ErrorIcon}
          iconClassName="bg-danger/10 text-danger"
        />
        <StatTile
          label="Leave"
          value={String(counts.leave)}
          sub={`${counts.leavePct}%`}
          icon={OverdueIcon}
          iconClassName="bg-warning/15 text-warning"
        />
      </div>

      <ListTableScreen
        tableTitle="Staff"
        filters={
          <ListPageToolbar
            searchQuery={term}
            onSearchQueryChange={(value) => {
              setTerm(value);
              setOffset(0);
            }}
            searchPlaceholder="Search by name, employee no. or email…"
            searchAriaLabel="Search staff"
            filters={
              <>
                {editable ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" tone="outline" className="shrink-0">
                        Fill all
                        <ChevronDownIcon className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {MARK_STATUSES.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => {
                            setSelectedStatus(status);
                          }}
                        >
                          {STAFF_ATTENDANCE_STATUS_LABELS[status]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                <div className="w-44 shrink-0">
                  <DatePicker
                    value={roster.date}
                    aria-label="Attendance date"
                    onChange={(nextValue) => {
                      router.push(tenantHref(`/attendance/mark/teachers?date=${nextValue}`));
                    }}
                  />
                </div>
              </>
            }
          />
        }
        footer={
          filtered.length === 0 ? null : (
            <div className="border-t border-border px-4 py-3">
              {filtered.length > PAGE_SIZE ? (
                <Pagination
                  total={filtered.length}
                  limit={PAGE_SIZE}
                  offset={offset}
                  label="staff"
                  onChange={(next) => {
                    setOffset(next);
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length} staff
                </p>
              )}
            </div>
          )
        }
      >
        <ListDataTable
          caption="Staff attendance register"
          rows={tableRows}
          columns={columns}
          rowKey={(row) => row.member.staffId}
          minWidthClass="min-w-[56rem]"
          empty={{
            title: roster.staff.length === 0 ? 'No staff on this date' : 'Nobody matches that',
            description:
              roster.staff.length === 0
                ? 'Someone who joined after this date does not appear on it.'
                : 'Clear the search to see everyone.',
          }}
        />
      </ListTableScreen>

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <LegendDot tone="success" label={`${counts.present} present`} />
            <LegendDot tone="danger" label={`${counts.absent} absent`} />
            <LegendDot tone="warning" label={`${counts.leave} leave`} />
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              tone="outline"
              onClick={() => {
                router.push(tenantHref(`/attendance/mark/students?date=${roster.date}`));
              }}
            >
              Cancel
            </Button>
            <Button isPending={isSaving} onClick={() => void submit()}>
              <SuccessIcon className="size-4" aria-hidden="true" />
              Submit attendance ({roster.staff.length})
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusToggle({
  status,
  active,
  disabled,
  onSelect,
}: {
  status: MarkStatus;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const label = STAFF_ATTENDANCE_STATUS_LABELS[status];
  const short = STAFF_ATTENDANCE_STATUS_SHORT[status];
  const tone = staffStatusTone(status);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm text-xs font-medium transition-colors disabled:opacity-60 sm:text-sm',
        active ? tone.labelActive : tone.labelIdle,
      )}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          active ? tone.dotActive : tone.dotIdle,
        )}
        aria-hidden="true"
      >
        {active ? <span className={cn('size-1.5 rounded-full', tone.innerDot)} /> : null}
      </span>
      <span className="hidden lg:inline">{label}</span>
      <span className="lg:hidden">{short}</span>
    </button>
  );
}

function staffStatusTone(status: MarkStatus): {
  labelActive: string;
  labelIdle: string;
  dotActive: string;
  dotIdle: string;
  innerDot: string;
} {
  switch (status) {
    case 'PRESENT':
      return {
        labelActive: 'text-primary',
        labelIdle: 'text-muted-foreground hover:text-foreground',
        dotActive: 'border-primary bg-primary',
        dotIdle: 'border-muted-foreground/35 bg-transparent',
        innerDot: 'bg-primary-foreground',
      };
    case 'ABSENT':
      return {
        labelActive: 'text-danger',
        labelIdle: 'text-danger/45 hover:text-danger/70',
        dotActive: 'border-danger bg-danger',
        dotIdle: 'border-danger/35 bg-transparent',
        innerDot: 'bg-background',
      };
    case 'LATE':
      return {
        labelActive: 'text-warning',
        labelIdle: 'text-warning/50 hover:text-warning/75',
        dotActive: 'border-warning bg-warning',
        dotIdle: 'border-warning/40 bg-transparent',
        innerDot: 'bg-background',
      };
    default:
      return {
        labelActive: 'text-primary',
        labelIdle: 'text-muted-foreground hover:text-foreground',
        dotActive: 'border-primary bg-primary',
        dotIdle: 'border-muted-foreground/35 bg-transparent',
        innerDot: 'bg-primary-foreground',
      };
  }
}

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof DesignationIcon;
  iconClassName: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 shadow-raised">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconClassName)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
          {value}
          {sub === undefined ? null : (
            <span className="ms-1 text-sm font-normal text-muted-foreground">({sub})</span>
          )}
        </p>
      </div>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: 'success' | 'danger' | 'warning'; label: string }) {
  const dot =
    tone === 'success' ? 'bg-success' : tone === 'danger' ? 'bg-danger' : 'bg-warning';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  );
}

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'warning' | 'muted';
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        tone === 'warning'
          ? 'border-warning/30 bg-warning/10'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? 'text-warning' : '')}
        aria-hidden="true"
      />
      <span>{children}</span>
    </div>
  );
}

function percent(part: number, total: number): string {
  if (total === 0) {
    return '0';
  }
  return String(Math.round((part / total) * 100));
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

function roleLabelFallback(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
