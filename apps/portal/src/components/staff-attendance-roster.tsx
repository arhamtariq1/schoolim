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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { ListPageToolbar } from '@/components/list-page-toolbar';
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

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((row) => selected.has(row.staffId));

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
                  <Button type="button" tone="outline" className="w-full sm:w-auto">
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
            <div className="w-full sm:w-44">
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

      <Card className="overflow-hidden shadow-raised">
        <CardHeader className="border-b border-border bg-card px-4 py-3 sm:px-6">
          <CardTitle className="text-base font-semibold">Staff</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="font-medium text-foreground">
                {roster.staff.length === 0 ? 'No staff on this date' : 'Nobody matches that'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {roster.staff.length === 0
                  ? 'Someone who joined after this date does not appear on it.'
                  : 'Clear the search to see everyone.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] border-collapse text-sm">
                  <caption className="sr-only">Staff attendance register</caption>
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                      <th scope="col" className="w-10 px-3 py-3">
                        {editable ? (
                          <Checkbox
                            checked={allPageSelected}
                            aria-label="Select all on this page"
                            onCheckedChange={() => {
                              toggleSelectAllOnPage();
                            }}
                          />
                        ) : null}
                      </th>
                      <th scope="col" className="w-10 px-2 py-3 text-end font-medium">
                        #
                      </th>
                      <th scope="col" className="px-4 py-3 text-start font-medium">
                        Staff
                      </th>
                      <th scope="col" className="px-4 py-3 text-start font-medium">
                        Emp. no.
                      </th>
                      <th scope="col" className="hidden px-4 py-3 text-start font-medium md:table-cell">
                        Role
                      </th>
                      <th scope="col" className="px-4 py-3 text-end font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((member, index) => (
                      <StaffRow
                        key={member.staffId}
                        member={member}
                        index={offset + index + 1}
                        status={marks[member.staffId] ?? 'PRESENT'}
                        editable={editable}
                        selected={selected.has(member.staffId)}
                        onSelect={(next) => {
                          setSelected((current) => {
                            const copy = new Set(current);
                            if (next) {
                              copy.add(member.staffId);
                            } else {
                              copy.delete(member.staffId);
                            }
                            return copy;
                          });
                        }}
                        onStatus={(status) => {
                          setMarks({ ...marks, [member.staffId]: status });
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > PAGE_SIZE ? (
                <div className="border-t border-border px-4 py-3">
                  <Pagination
                    total={filtered.length}
                    limit={PAGE_SIZE}
                    offset={offset}
                    label="staff"
                    onChange={(next) => {
                      setOffset(next);
                    }}
                  />
                </div>
              ) : (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
                  Showing {filtered.length === 0 ? 0 : offset + 1}–
                  {Math.min(offset + PAGE_SIZE, filtered.length)} of {filtered.length} staff
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

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

function StaffRow({
  member,
  index,
  status,
  editable,
  selected,
  onSelect,
  onStatus,
}: {
  member: StaffRosterEntry;
  index: number;
  status: StaffAttendanceStatus;
  editable: boolean;
  selected: boolean;
  onSelect: (next: boolean) => void;
  onStatus: (status: StaffAttendanceStatus) => void;
}) {
  const { firstName, lastName } = splitName(member.name);
  const roleLabel =
    member.role in STAFF_ROLE_LABELS
      ? STAFF_ROLE_LABELS[member.role as StaffRole]
      : roleLabelFallback(member.role);

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-3 align-middle">
        {editable ? (
          <Checkbox
            checked={selected}
            aria-label={`Select ${member.name}`}
            onCheckedChange={(checked) => {
              onSelect(checked === true);
            }}
          />
        ) : null}
      </td>
      <td className="px-2 py-3 text-end font-mono text-xs text-muted-foreground tabular-nums">
        {index}
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <StudentAdmissionAvatar
            firstName={firstName}
            lastName={lastName}
            photoUrl={member.photoUrl}
            className="size-9 text-[11px]"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{member.name}</p>
            {member.email === null ? null : (
              <p className="truncate text-xs text-muted-foreground md:hidden">{member.email}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-foreground tabular-nums">
        {member.employeeNo}
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <StatusBadge tone="neutral" size="sm">
          {roleLabel}
        </StatusBadge>
      </td>
      <td className="px-4 py-3 align-middle">
        <div
          role="radiogroup"
          aria-label={`Attendance for ${member.name}`}
          className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
        >
          {MARK_STATUSES.map((option) => (
            <StatusToggle
              key={option}
              status={option}
              active={status === option}
              disabled={!editable}
              onSelect={() => {
                onStatus(option);
              }}
            />
          ))}
        </div>
      </td>
    </tr>
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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-raised">
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
