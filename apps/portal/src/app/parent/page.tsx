import {
  ROUTES,
  type ParentAttendance,
  type ParentChildProfile,
  type ParentChildSummary,
  type StudentMarkResult,
} from '@ilm/contracts';
import { redirect } from 'next/navigation';

import { ParentDashboard } from '@/components/parent-dashboard';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';

/**
 * The parent portal: one child at a time, chosen by `?child=<id>`.
 *
 * A link rather than client state so the page is a plain server render — a
 * parent on a cheap phone downloads no switcher script — and so a particular
 * child can be bookmarked. The API decides what each id may return; an id that
 * is not theirs comes back as "not found" and renders the first child instead.
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
    return <ParentDashboard name={session.name} kids={[]} error={list.message} />;
  }

  const children = list.data.data;
  const selected = children.find((child) => child.id === requested) ?? children[0];

  if (selected === undefined) {
    return <ParentDashboard name={session.name} kids={children} />;
  }

  const [profile, attendance, marks] = await Promise.all([
    apiFetch<{ data: ParentChildProfile }>(ROUTES.parent.child(selected.id)),
    apiFetch<{ data: ParentAttendance }>(ROUTES.parent.attendance(selected.id)),
    apiFetch<{ data: StudentMarkResult[] }>(ROUTES.parent.marks(selected.id)),
  ]);

  return (
    <ParentDashboard
      name={session.name}
      kids={children}
      selectedId={selected.id}
      profile={profile.ok ? profile.data.data : undefined}
      attendance={attendance.ok ? attendance.data.data : undefined}
      marks={marks.ok ? marks.data.data : undefined}
      error={
        profile.ok && attendance.ok
          ? undefined
          : 'Some of this child’s information could not be loaded. Refresh to try again.'
      }
    />
  );
}
