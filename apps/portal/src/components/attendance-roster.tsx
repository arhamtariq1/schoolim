'use client';


import {
  ATTENDANCE_STATUS_LABELS,
  ROUTES,
  type AttendanceStatus,
  type MarkResult,
  type Roster,
} from '@ilm/contracts';
import { Button, cn, DatePicker, Field, Input, useToast } from '@ilm/ui';
import { BackIcon, ICON_SIZE, LockedIcon, SearchIcon, WarningIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { closedMessage } from './attendance-class-grid';

import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Marking a class.
 *
 * ## Everyone starts present
 *
 * docs/modules §3 makes this mandatory rather than a nicety: a teacher marks
 * forty children between two periods, and if they have to tap forty times they
 * go back to the paper register — after which every attendance figure in this
 * product is fiction. So an unmarked roster opens with everybody Present and
 * the teacher taps only the exceptions.
 *
 * ## One submit
 *
 * No per-row save and no confirmation dialog. The counter in the sticky bar is
 * the confirmation: it says what is about to be recorded, and it updates as
 * they tap.
 *
 * ## Search filters, it does not hide
 *
 * Typing a name narrows the visible list but keeps every mark in state, so a
 * teacher who searches for one child and submits does not silently wipe the
 * other thirty-nine. That is the bug this pattern usually ships with.
 */

export interface AttendanceRosterProps {
  roster: Roster;
  canMark: boolean;
  error?: string | undefined;
}

/** The three a teacher needs at speed. The rest live behind "More". */
const QUICK: readonly AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LEAVE'];
const EXTRA: readonly AttendanceStatus[] = ['LATE', 'HALF_DAY', 'EXCUSED'];

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
  const [showExtra, setShowExtra] = useState(() =>
    roster.students.some((student) => student.status !== null && !QUICK.includes(student.status)),
  );
  const [isSaving, setIsSaving] = useState(false);

  const visible = useMemo(() => {
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

  // Counted over the whole roster, never over what search happens to show.
  const counts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter(
        (status) => status === 'PRESENT' || status === 'LATE' || status === 'HALF_DAY',
      ).length,
      absent: values.filter((status) => status === 'ABSENT').length,
      leave: values.filter((status) => status === 'LEAVE' || status === 'EXCUSED').length,
    };
  }, [marks]);

  const statuses = showExtra ? [...QUICK, ...EXTRA] : QUICK;
  const editable = canMark && roster.isEditable;

  function setAll(status: AttendanceStatus) {
    setMarks(Object.fromEntries(roster.students.map((student) => [student.studentId, status])));
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
      `${String(result.data.saved)} marked`,
      result.data.skipped > 0
        ? `${String(result.data.skipped)} skipped — not enrolled on this date.`
        : undefined,
    );
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-24">
      <div>
        <Link
          href={tenantHref('/attendance/mark/students')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <BackIcon className={ICON_SIZE.inline} aria-hidden />
          All classes
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">{roster.className}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLongDate(roster.date)}
          {roster.markedAt === null
            ? ' · not marked yet'
            : ` · marked by ${roster.markedByName ?? 'someone'} at ${formatTime(roster.markedAt)}`}
        </p>
      </div>

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Field label="Find a student">
            <div className="relative">
              <Input
                value={term}
                placeholder="Name, GR number or father"
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
                router.push(
                  tenantHref(
                    `/attendance/mark/students/${roster.classLevelId}?date=${nextValue}`,
                  ),
                );
              }}
            />
          </Field>
        </div>
        <Button
          type="button"
          tone="ghost"
          onClick={() => {
            setShowExtra(!showExtra);
          }}
        >
          {showExtra ? 'Fewer options' : 'More options'}
        </Button>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mark everyone:</span>
          {QUICK.map((status) => (
            <Button
              key={status}
              type="button"
              tone="outline"
              size="sm"
              onClick={() => {
                setAll(status);
              }}
            >
              {ATTENDANCE_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium text-foreground">
            {roster.students.length === 0 ? 'Nobody is enrolled here' : 'No student matches that'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {roster.students.length === 0
              ? 'A child admitted after this date does not appear on it, which is why they can never be marked absent for it.'
              : 'Clear the search to see the whole class.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.map((student, index) => {
            const current = marks[student.studentId] ?? 'PRESENT';
            return (
              <li
                key={student.studentId}
                className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap"
              >
                <span className="w-8 shrink-0 text-center font-mono text-sm text-muted-foreground tabular-nums">
                  {student.rollNo ?? index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{student.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    GR {student.grNo}
                    {student.fatherName === null ? '' : ` · ${student.fatherName}`}
                  </span>
                </span>

                <div
                  role="radiogroup"
                  aria-label={`Attendance for ${student.name}`}
                  className="flex shrink-0 gap-1"
                >
                  {statuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={current === status}
                      disabled={!editable}
                      onClick={() => {
                        setMarks({ ...marks, [student.studentId]: status });
                      }}
                      className={cn(
                        // A 40px target: this is used on a phone, in a corridor.
                        'min-w-10 rounded-md px-2.5 py-2 text-sm font-medium transition-colors disabled:opacity-60',
                        current === status
                          ? toneFor(status)
                          : 'bg-muted text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {SHORT[status]}
                      <span className="sr-only"> {ATTENDANCE_STATUS_LABELS[status]}</span>
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sticky, because the submit must be reachable at any scroll position on
          a forty-row list — docs §3. */}
      {editable ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">
              <span className="font-medium text-success">{counts.present}</span> present ·{' '}
              <span className="font-medium text-danger">{counts.absent}</span> absent ·{' '}
              <span className="font-medium text-muted-foreground">{counts.leave}</span> leave
            </p>
            <Button size="touch" isPending={isSaving} onClick={() => void submit()}>
              {roster.markedAt === null ? 'Submit' : 'Update'} ({roster.students.length})
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const SHORT: Readonly<Record<AttendanceStatus, string>> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LEAVE: 'Lv',
  LATE: 'L',
  HALF_DAY: 'H',
  EXCUSED: 'E',
};

function toneFor(status: AttendanceStatus): string {
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

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'warning' | 'muted';
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
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
        className={cn(
          ICON_SIZE.inline,
          'mt-0.5 shrink-0',
          tone === 'warning' ? 'text-warning' : '',
        )}
        aria-hidden
      />
      <span>{children}</span>
    </div>
  );
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
