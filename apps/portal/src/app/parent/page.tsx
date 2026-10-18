import {
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

import { ParentDashboard } from '@/components/parent-dashboard';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';

export const metadata: Metadata = { title: 'My children' };

/** How far ahead "upcoming tests and exams" looks. */
const UPCOMING_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The parent portal: one child at a time, chosen by `?child=<id>`.
 *
 * A link rather than client state so the page is a plain server render — a
 * parent on a cheap phone downloads no switcher script — and so a particular
 * child can be bookmarked. The API decides what each id may return; an id that
 * is not theirs comes back as "not found" and renders the first child instead.
 *
 * Everything on the page is read for the selected child alone: their attendance,
 * their class's timetable and exams, their own vouchers and what they add up to.
 */
export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('parent.child.read')) {
    redirect('/');
  }

  const query = await searchParams;
  const requested = typeof query['child'] === 'string' ? query['child'] : undefined;

  const list = await apiFetch<{ data: ParentChildSummary[] }>(ROUTES.parent.children);
  if (!list.ok) {
    return <ParentDashboard kids={[]} upcoming={[]} error={list.message} />;
  }

  const children = list.data.data;
  const selected = children.find((child) => child.id === requested) ?? children[0];
  const now = systemClock.now();
  const today = now.toISOString().slice(0, 10);

  if (selected === undefined) {
    return <ParentDashboard kids={children} upcoming={[]} />;
  }

  const canSeeVouchers = session.permissions.includes('parent.voucher.read');
  const canSeeTimetable = session.permissions.includes('academics.timetable.read');

  const calendar = (from: string, to: string): string => {
    const params = new URLSearchParams({ from, to });
    if (selected.classLevelId !== null) params.set('classLevelId', selected.classLevelId);
    if (selected.sectionId !== null) params.set('sectionId', selected.sectionId);
    return `${ROUTES.timetables.calendar}?${params.toString()}`;
  };
  const horizon = new Date(now.getTime() + UPCOMING_DAYS * DAY_MS).toISOString().slice(0, 10);

  /** The class's published weekly timetable: its own section's if it has one, else the whole class's. */
  async function weeklyTimetable(): Promise<TimetableDetail | undefined> {
    if (!canSeeTimetable || selected === undefined || selected.classLevelId === null) return undefined;
    const found = await apiFetch<{ data: TimetableListItem[] }>(
      `${ROUTES.timetables.list}?classLevelId=${selected.classLevelId}&kind=CLASS&limit=20`,
    );
    if (!found.ok) return undefined;
    const mine = found.data.data.filter((item) => item.section === null || item.section.id === selected.sectionId);
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
      ? apiFetch<{ data: ParentVoucherList }>(`${ROUTES.parent.vouchers}?studentId=${selected.id}&limit=5`)
      : Promise.resolve(undefined),
    weeklyTimetable(),
    canSeeTimetable && selected.classLevelId !== null
      ? apiFetch<{ data: TimetableCalendarEvent[] }>(calendar(today, horizon))
      : Promise.resolve(undefined),
  ]);

  // The next few tests and exams — the strip is a glance, not a diary.
  const upcoming =
    ahead?.ok === true
      ? ahead.data.data
          .filter((event) => event.kind !== 'CLASS')
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
          .slice(0, 2)
      : [];

  return (
    <ParentDashboard
      kids={children}
      selectedId={selected.id}
      profile={profile.ok ? profile.data.data : undefined}
      attendance={attendance.ok ? attendance.data.data : undefined}
      marks={marks.ok ? marks.data.data : undefined}
      vouchers={vouchers?.ok === true ? vouchers.data.data : undefined}
      weekly={weekly}
      upcoming={upcoming}
      error={
        profile.ok && attendance.ok
          ? undefined
          : 'Some of this child’s information could not be loaded. Refresh to try again.'
      }
    />
  );
}
