'use client';

import {
  ATTENDANCE_STATUS_LABELS,
  ROUTES,
  type AttendanceStatus,
  type MarkResult,
  type Roster,
  type RosterEntry,
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
  OverdueIcon,
  StudentsIcon,
  SuccessIcon,
  WarningIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';

import { closedMessage } from './attendance-class-grid';

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

const QUICK = ['PRESENT', 'ABSENT', 'LEAVE'] as const satisfies readonly AttendanceStatus[];
type QuickStatus = (typeof QUICK)[number];
const PAGE_SIZE = 8;

type StudentRosterTableRow = {
  readonly student: RosterEntry;
  readonly index: number;
};

export interface AttendanceRosterProps {
  roster: Roster;
  canMark: boolean;
  error?: string | undefined;
}

export function AttendanceRoster({ roster, canMark, error }: AttendanceRosterProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(
      roster.students.map((student) => [student.studentId, student.status ?? 'PRESENT']),
    ),
  );
  const [term, setTerm] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [isSaving, setIsSaving] = useState(false);

  const editable = canMark && roster.isEditable;

  const filtered = useMemo(() => {
    const query = term.trim().toLowerCase();
    if (query === '') {
      return roster.students;
    }
    return roster.students.filter(
      (student) =>
        student.name.toLowerCase().includes(query) ||
        student.grNo.toLowerCase().includes(query) ||
        (student.fatherName ?? '').toLowerCase().includes(query),
    );
  }, [roster.students, term]);

  const pageRows = useMemo(() => {
    return filtered.slice(offset, offset + PAGE_SIZE);
  }, [filtered, offset]);

  const allPageSelected =
    pageRows.length > 0 && pageRows.every((row) => selected.has(row.studentId));

  function toggleSelectAllOnPage(): void {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        for (const row of pageRows) {
          next.delete(row.studentId);
        }
      } else {
        for (const row of pageRows) {
          next.add(row.studentId);
        }
      }
      return next;
    });
  }

  const tableRows = useMemo(
    (): StudentRosterTableRow[] =>
      pageRows.map((student, index) => ({ student, index: offset + index + 1 })),
    [pageRows, offset],
  );

  const columns = useMemo((): CardTableColumn<StudentRosterTableRow>[] => {
    const cols: CardTableColumn<StudentRosterTableRow>[] = [];

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
              checked={selected.has(row.student.studentId)}
              aria-label={`Select ${row.student.name}`}
              onCheckedChange={(checked) => {
                setSelected((current) => {
                  const copy = new Set(current);
                  if (checked === true) {
                    copy.add(row.student.studentId);
                  } else {
                    copy.delete(row.student.studentId);
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
        key: 'student',
        label: 'Student',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[28%]',
        headerCell: feeListTableHeader('Student', StudentsIcon),
        render: (row) => {
          const { firstName, lastName } = splitName(row.student.name);
          return (
            <div className="flex min-w-0 items-center gap-3">
              <StudentAdmissionAvatar
                firstName={firstName}
                lastName={lastName}
                photoUrl={row.student.photoUrl}
                className="size-9 text-[11px]"
              />
              <span className="truncate font-medium text-foreground">{row.student.name}</span>
            </div>
          );
        },
      },
      {
        key: 'grNo',
        label: 'GR number',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[12%]',
        headerCell: feeListTableHeader('GR number', StudentsIcon),
        render: (row) => (
          <span className="font-mono text-sm tabular-nums">{row.student.grNo}</span>
        ),
      },
      {
        key: 'father',
        label: 'Father name',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[18%]',
        hideOnMobile: true,
        headerCell: feeListTableHeader('Father name', StudentsIcon),
        render: (row) => row.student.fatherName ?? '—',
      },
      {
        key: 'status',
        label: 'Status',
        ...FEE_LIST_TABLE_CELL,
        width: 'w-[28%]',
        align: 'end',
        headerCell: feeListTableHeader('Status'),
        render: (row) => (
          <div
            role="radiogroup"
            aria-label={`Attendance for ${row.student.name}`}
            className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2"
            data-stop-row-click
          >
            {QUICK.map((option) => (
              <StatusToggle
                key={option}
                status={option}
                active={(marks[row.student.studentId] ?? 'PRESENT') === option}
                disabled={!editable}
                onSelect={() => {
                  setMarks({ ...marks, [row.student.studentId]: option });
                }}
              />
            ))}
          </div>
        ),
      },
    );

    return cols;
  }, [
    allPageSelected,
    editable,
    marks,
    selected,
    toggleSelectAllOnPage,
  ]);

  const counts = useMemo(() => {
    const values = Object.values(marks);
    const total = roster.students.length;
    const present = values.filter((status) => status === 'PRESENT').length;
    const absent = values.filter((status) => status === 'ABSENT').length;
    const leave = values.filter((status) => status === 'LEAVE').length;
    return {
      total,
      present,
      absent,
      leave,
      presentPct: percent(present, total),
      absentPct: percent(absent, total),
      leavePct: percent(leave, total),
    };
  }, [marks, roster.students.length]);

  function setAll(status: AttendanceStatus) {
    setMarks(Object.fromEntries(roster.students.map((student) => [student.studentId, status])));
  }

  function setSelectedStatus(status: AttendanceStatus) {
    const targets =
      selected.size > 0 ? roster.students.filter((s) => selected.has(s.studentId)) : roster.students;
    setMarks((current) => {
      const next = { ...current };
      for (const student of targets) {
        next[student.studentId] = status;
      }
      return next;
    });
  }

  async function submit() {
    setIsSaving(true);
    const result = await mutate<MarkResult>(ROUTES.attendance.mark, 'POST', {
      classLevelId: roster.classLevelId,
      date: roster.date,
      entries: roster.students.map((student) => ({
        studentId: student.studentId,
        status: marks[student.studentId] ?? 'PRESENT',
      })),
    });
    setIsSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(
      result.data.skipped > 0
        ? `${String(result.data.saved)} marked (${String(result.data.skipped)} skipped).`
        : `${String(result.data.saved)} marked.`,
    );
    router.push(tenantHref(`/attendance/mark/students?date=${roster.date}`));
  }

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader
        title="Mark attendance"
        description={
          <StatusBadge tone="neutral" size="sm">
            {roster.className}
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
          {closedMessage(roster.day)}
        </Notice>
      )}

      {roster.lockedReason === null ? null : (
        <Notice tone="muted" icon={LockedIcon}>
          {roster.lockedReason}
        </Notice>
      )}

      {canMark || !roster.day.isWorkingDay ? null : (
        <Notice tone="muted" icon={LockedIcon}>
          You can see this register but not change it.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total students"
          value={String(counts.total)}
          icon={StudentsIcon}
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
        tableTitle="Students"
        filters={
          <ListPageToolbar
            searchQuery={term}
            onSearchQueryChange={(value) => {
              setTerm(value);
              setOffset(0);
            }}
            searchPlaceholder="Search by name, GR number or father name…"
            searchAriaLabel="Search students in class"
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
                    <DropdownMenuContent align="end" className="w-44">
                      {QUICK.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onSelect={() => {
                            setSelectedStatus(status);
                          }}
                        >
                          {ATTENDANCE_STATUS_LABELS[status]}
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
                      router.push(
                        tenantHref(
                          `/attendance/mark/students/${roster.classLevelId}?date=${nextValue}`,
                        ),
                      );
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
                  label="students"
                  onChange={(next) => {
                    setOffset(next);
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length} students
                </p>
              )}
            </div>
          )
        }
      >
        <ListDataTable
          caption="Class attendance register"
          rows={tableRows}
          columns={columns}
          rowKey={(row) => row.student.studentId}
          minWidthClass="min-w-[48rem]"
          empty={{
            title:
              roster.students.length === 0 ? 'Nobody is enrolled here' : 'No student matches that',
            description:
              roster.students.length === 0
                ? 'Admit students into this class to mark attendance.'
                : 'Clear the search to see the whole class.',
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
              Submit attendance ({roster.students.length})
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
  status: QuickStatus;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const label = ATTENDANCE_STATUS_LABELS[status];
  const tone = statusTone(status);

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'inline-flex items-center gap-2 rounded-sm text-sm font-medium transition-colors disabled:opacity-60',
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
      {label}
    </button>
  );
}

function statusTone(status: QuickStatus): {
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
    default:
      return {
        labelActive: 'text-warning',
        labelIdle: 'text-warning/50 hover:text-warning/75',
        dotActive: 'border-warning bg-warning',
        dotIdle: 'border-warning/40 bg-transparent',
        innerDot: 'bg-background',
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
  icon: typeof StudentsIcon;
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
