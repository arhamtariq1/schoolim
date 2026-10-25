import {
  PARENT_ATTENDANCE_STATUSES,
  ROUTES,
  type ParentAttendance,
  type ParentChildProfile,
  type ParentChildSummary,
  type ParentVoucherList,
  type StudentMarkResult,
  type TimetableDetail,
  type TimetableListItem,
  type TimetableCalendarEvent,
} from '@ilm/contracts';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  ParentDashboard,
  type ChildOverview,
  type ChildResult,
  type UpcomingItem,
} from '@/components/parent-dashboard';
import { apiFetch } from '@/lib/api';
import { loadParentChildren } from '@/lib/parent-children';
import { requireSchoolSession } from '@/lib/require-session';

export const metadata: Metadata = { title: 'My children' };

/** How far ahead "upcoming tests and exams" looks. */
const UPCOMING_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The upcoming strip is a glance, not a diary — a few more when it covers every child. */
const UPCOMING_ONE = 2;
const UPCOMING_ALL = 4;

const ATTENDING = ['PRESENT', 'LATE', 'HALF_DAY'] as const;

/**
 * The parent portal: every child together, or the one chosen in the header.
 *
 * The header's child filter keeps that choice in a cookie
 * (`lib/parent-child-selection.ts`), so it holds on every parent page. With no
 * choice (or one that is not theirs) a parent of several children sees all of
 * them at once; a parent of one sees that one.
 *
 * Every figure comes from the parent routes, which start at the signed-in
 * guardian. "All children" is those same per-child answers added together here;
 * the one exception is the voucher list, which the API already totals across
 * every linked child when no student is named.
 */
export default async function ParentPage() {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('parent.child.read')) {
    redirect('/');
  }

  const family = await loadParentChildren();
  if (family.error !== undefined) {
    return <ParentDashboard kids={[]} upcoming={[]} error={family.error} />;
  }

  const children = family.kids;
  const selected = family.selected;
  const now = systemClock.now();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * DAY_MS).toISOString().slice(0, 10);

  const canSeeVouchers = session.permissions.includes('parent.voucher.read');
  const canSeeTimetable = session.permissions.includes('academics.timetable.read');

  /** The tests and exams ahead for one class (and section, when the child has one). */
  async function upcomingFor(child: ParentChildSummary): Promise<TimetableCalendarEvent[]> {
    if (!canSeeTimetable || child.classLevelId === null) return [];
    const params = new URLSearchParams({
      from: today,
      to: horizon,
      classLevelId: child.classLevelId,
    });
    if (child.sectionId !== null) params.set('sectionId', child.sectionId);
    const found = await apiFetch<{ data: TimetableCalendarEvent[] }>(
      `${ROUTES.timetables.calendar}?${params.toString()}`,
    );
    return found.ok ? found.data.data.filter((event) => event.kind !== 'CLASS') : [];
  }

  const soonestFirst = (a: UpcomingItem, b: UpcomingItem): number =>
    a.event.date.localeCompare(b.event.date) || a.event.startTime.localeCompare(b.event.startTime);

  if (selected === undefined) {
    if (children.length === 0) {
      return <ParentDashboard kids={children} upcoming={[]} />;
    }
    // ---- every child --------------------------------------------------------------

    const firstName = (child: ParentChildSummary): string =>
      child.name.split(/\s+/)[0] ?? child.name;

    const [perChild, allVouchers] = await Promise.all([
      Promise.all(
        children.map(async (child) => {
          const [attendance, marks, vouchers, ahead] = await Promise.all([
            apiFetch<{ data: ParentAttendance }>(ROUTES.parent.attendance(child.id)),
            apiFetch<{ data: StudentMarkResult[] }>(ROUTES.parent.marks(child.id)),
            canSeeVouchers
              ? apiFetch<{ data: ParentVoucherList }>(
                  `${ROUTES.parent.vouchers}?studentId=${child.id}&limit=1`,
                )
              : Promise.resolve(undefined),
            upcomingFor(child),
          ]);
          return { child, attendance, marks, vouchers, ahead };
        }),
      ),
      canSeeVouchers
        ? apiFetch<{ data: ParentVoucherList }>(`${ROUTES.parent.vouchers}?limit=5`)
        : Promise.resolve(undefined),
    ]);

    const overview: ChildOverview[] = perChild.map(({ child, attendance, vouchers }) => ({
      child,
      attendancePercent: attendance.ok ? attendance.data.data.attendancePercent : null,
      pendingMinor: vouchers?.ok === true ? vouchers.data.data.totals.pendingMinor : null,
    }));

    // One month's attendance across every child: counts added, the share worked out again
    // from the sums rather than averaged, so a child with more marked days weighs more.
    const sheets = perChild.flatMap(({ attendance }) =>
      attendance.ok ? [attendance.data.data] : [],
    );
    const first = sheets[0];
    let combined: ParentAttendance | undefined;
    if (first !== undefined) {
      const counts = Object.fromEntries(
        PARENT_ATTENDANCE_STATUSES.map((status) => [
          status,
          sheets.reduce((sum, sheet) => sum + (sheet.counts[status] ?? 0), 0),
        ]),
      ) as ParentAttendance['counts'];
      const markedDays = sheets.reduce((sum, sheet) => sum + sheet.markedDays, 0);
      const attending = ATTENDING.reduce((sum, status) => sum + counts[status], 0);
      combined = {
        month: first.month,
        markedDays,
        counts,
        // Half-up to one decimal, the API's own rounding for this figure (`Math.round`
        // is banned, ADR-0007; `trunc(x + 0.5)` is the same thing for a percentage).
        attendancePercent:
          markedDays === 0 ? null : Math.trunc((attending / markedDays) * 1000 + 0.5) / 10,
        recent: [],
      };
    }

    const results: ChildResult[] = perChild
      .flatMap(({ child, marks }) =>
        marks.ok ? marks.data.data.map((mark) => ({ ...mark, studentName: firstName(child) })) : [],
      )
      .sort((a, b) => b.heldOn.localeCompare(a.heldOn));

    const upcoming: UpcomingItem[] = perChild
      .flatMap(({ child, ahead }) => ahead.map((event) => ({ event, who: firstName(child) })))
      .sort(soonestFirst)
      .slice(0, UPCOMING_ALL);

    const failed = perChild.some(({ attendance }) => !attendance.ok);

    return (
      <ParentDashboard
        kids={children}
        overview={overview}
        attendance={combined}
        marks={results}
        vouchers={allVouchers?.ok === true ? allVouchers.data.data : undefined}
        upcoming={upcoming}
        error={
          failed
            ? 'Some of your children’s information could not be loaded. Refresh to try again.'
            : undefined
        }
      />
    );
  }

  // ---- one child ----------------------------------------------------------------

  /** The class's published weekly timetable: its own section's if it has one, else the whole class's. */
  async function weeklyTimetable(child: ParentChildSummary): Promise<TimetableDetail | undefined> {
    if (!canSeeTimetable || child.classLevelId === null) return undefined;
    const found = await apiFetch<{ data: TimetableListItem[] }>(
      `${ROUTES.timetables.list}?classLevelId=${child.classLevelId}&kind=CLASS&limit=20`,
    );
    if (!found.ok) return undefined;
    const mine = found.data.data.filter(
      (item) => item.section === null || item.section.id === child.sectionId,
    );
    const pick = mine.find((item) => item.section !== null) ?? mine[0];
    if (pick === undefined) return undefined;
    const detail = await apiFetch<{ data: TimetableDetail }>(ROUTES.timetables.detail(pick.id));
    return detail.ok ? detail.data.data : undefined;
  }

  const [profile, attendance, marks, vouchers, weekly, ahead] = await Promise.all([
    apiFetch<{ data: ParentChildProfile }>(ROUTES.parent.child(selected.id)),
    apiFetch<{ data: ParentAttendance }>(ROUTES.parent.attendance(selected.id)),
    apiFetch<{ data: StudentMarkResult[] }>(ROUTES.parent.marks(selected.id)),
    canSeeVouchers
      ? apiFetch<{ data: ParentVoucherList }>(
          `${ROUTES.parent.vouchers}?studentId=${selected.id}&limit=5`,
        )
      : Promise.resolve(undefined),
    weeklyTimetable(selected),
    upcomingFor(selected),
  ]);

  return (
    <ParentDashboard
      kids={children}
      selectedId={selected.id}
      profile={profile.ok ? profile.data.data : undefined}
      attendance={attendance.ok ? attendance.data.data : undefined}
      marks={marks.ok ? marks.data.data : undefined}
      vouchers={vouchers?.ok === true ? vouchers.data.data : undefined}
      weekly={weekly}
      upcoming={ahead
        .map((event) => ({ event }))
        .sort(soonestFirst)
        .slice(0, UPCOMING_ONE)}
      error={
        profile.ok && attendance.ok
          ? undefined
          : 'Some of this child’s information could not be loaded. Refresh to try again.'
      }
    />
  );
}
