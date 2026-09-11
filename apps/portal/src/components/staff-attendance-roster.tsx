'use client';


import {
  ROUTES,
  STAFF_ATTENDANCE_STATUS_LABELS,
  STAFF_ATTENDANCE_STATUS_SHORT,
  type MarkResult,
  type StaffAttendanceStatus,
  type StaffRoster,
} from '@ilm/contracts';
import { Button, cn, DatePicker, Field, Input, useToast } from '@ilm/ui';
import { ICON_SIZE, LockedIcon, SearchIcon, WarningIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Marking staff.
 *
 * The same shape as the student register — default present, one submit, a
 * sticky counter — with the statuses staff actually take. Sick and casual
 * leave are separate here because they draw against different allowances on the
 * staff record, and payroll later cares which one it was.
 */

export interface StaffAttendanceRosterProps {
  roster: StaffRoster;
  canMark: boolean;
  error?: string | undefined;
}

const STATUSES: readonly StaffAttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'SICK_LEAVE',
  'CASUAL_LEAVE',
];

export function StaffAttendanceRosterView({ roster, canMark, error }: StaffAttendanceRosterProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [marks, setMarks] = useState<Record<string, StaffAttendanceStatus>>(() =>
    Object.fromEntries(roster.staff.map((member) => [member.staffId, member.status ?? 'PRESENT'])),
  );
  const [term, setTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const visible = useMemo(() => {
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

  // Over everybody, never over the filtered view.
  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((s) => s === 'PRESENT' || s === 'LATE' || s === 'HALF_DAY').length,
      absent: values.filter((s) => s === 'ABSENT').length,
      leave: values.filter((s) => s === 'SICK_LEAVE' || s === 'CASUAL_LEAVE').length,
    };
  }, [marks]);

  const editable = canMark && roster.isEditable;

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
    <div className="space-y-5 pb-24">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Staff attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLongDate(roster.date)}
          {roster.markedAt === null ? ' · not marked yet' : ' · already marked'}
        </p>
      </header>

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {roster.day.isWorkingDay ? null : (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <WarningIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0 text-warning`} aria-hidden />
          <span>
            {roster.day.reason === 'FUTURE'
              ? 'That day has not happened yet.'
              : `${roster.day.holidayName ?? 'This day'} — not a working day for staff.`}
          </span>
        </div>
      )}

      {roster.lockedReason === null ? null : (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <LockedIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0`} aria-hidden />
          <span>{roster.lockedReason}</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label="Find someone">
            <div className="relative">
              <Input
                value={term}
                placeholder="Name, employee number or email"
                onChange={(event) => {
                  setTerm(event.target.value);
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
          <Field label="Date">
            <DatePicker
              value={roster.date}
              onChange={(nextValue) => {
                router.push(tenantHref(`/attendance/mark/teachers?date=${nextValue}`));
              }}
            />
          </Field>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium text-foreground">
            {roster.staff.length === 0 ? 'No staff on this date' : 'Nobody matches that'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {roster.staff.length === 0
              ? 'Somebody who joined after this date does not appear on it.'
              : 'Clear the search to see everyone.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((member) => {
            const current = marks[member.staffId] ?? 'PRESENT';
            return (
              <li key={member.staffId} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{member.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {member.employeeNo} · {roleLabel(member.role)}
                    {member.email === null ? '' : ` · ${member.email}`}
                  </span>
                </span>

                <div
                  role="radiogroup"
                  aria-label={`Attendance for ${member.name}`}
                  className="flex shrink-0 gap-1"
                >
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={current === status}
                      disabled={!editable}
                      title={STAFF_ATTENDANCE_STATUS_LABELS[status]}
                      onClick={() => {
                        setMarks({ ...marks, [member.staffId]: status });
                      }}
                      className={cn(
                        'min-w-10 rounded-md px-2.5 py-2 text-sm font-medium transition-colors disabled:opacity-60',
                        current === status
                          ? toneFor(status)
                          : 'bg-muted text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {STAFF_ATTENDANCE_STATUS_SHORT[status]}
                      <span className="sr-only"> {STAFF_ATTENDANCE_STATUS_LABELS[status]}</span>
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editable ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">
              <span className="font-medium text-success">{counts.present}</span> present ·{' '}
              <span className="font-medium text-danger">{counts.absent}</span> absent ·{' '}
              <span className="font-medium text-muted-foreground">{counts.leave}</span> leave
            </p>
            <Button size="touch" isPending={isSaving} onClick={() => void submit()}>
              {roster.markedAt === null ? 'Submit' : 'Update'} ({roster.staff.length})
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toneFor(status: StaffAttendanceStatus): string {
  switch (status) {
    case 'PRESENT':
      return 'bg-success text-success-foreground';
    case 'ABSENT':
      return 'bg-danger text-danger-foreground';
    case 'LATE':
      return 'bg-warning text-warning-foreground';
    default:
      return 'bg-primary text-primary-foreground';
  }
}

function roleLabel(role: string): string {
  return role
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
