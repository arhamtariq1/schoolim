import { ROUTES, type StaffProfile } from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import { systemClock } from '@ilm/utils';
import { notFound } from 'next/navigation';

import { StaffProfileView } from '@/components/staff-profile-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** One staff member — overview, attendance and salary history. */
export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;

  if (session === undefined) {
    return <SignedOut />;
  }

  const [result, classes] = await Promise.all([
    apiFetch<{ data: StaffProfile }>(ROUTES.staff.detail(id)),
    apiFetch<{ data: { id: string; name: string }[] }>(ROUTES.students.classOptions),
  ]);

  if (!result.ok && result.status === 404) {
    notFound();
  }
  if (!result.ok) {
    return <EmptyState title="That did not load" description={result.message} />;
  }

  const has = (permission: string): boolean => session.permissions.includes(permission);
  const profile = result.data.data;

  // Names for the classes a teacher takes, from the same list the staff form
  // offers — so what is shown here is what was picked there.
  const nameOf = new Map((classes.ok ? classes.data.data : []).map((entry) => [entry.id, entry.name]));
  const classNames = profile.classLevelIds.flatMap((classId) => {
    const name = nameOf.get(classId);
    return name === undefined ? [] : [name];
  });

  return (
    <StaffProfileView
      profile={profile}
      classNames={classNames}
      can={{
        edit: has('staff.record.update'),
        attendance: has('attendance.staff.read'),
        salary: has('staff.salary.read'),
        pay: has('staff.salary.pay'),
      }}
      today={systemClock.now().toISOString().slice(0, 10)}
    />
  );
}

function SignedOut() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">
        Your session has ended.{' '}
        <a className="underline" href="/login">
          Sign in again
        </a>
        .
      </p>
    </main>
  );
}
