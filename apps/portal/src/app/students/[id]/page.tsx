import { ROUTES, type StudentProfile } from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { StudentProfileView } from '@/components/student-profile-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * One student, everything about them.
 *
 * The screen a school actually lives in: someone rings about a child, and the
 * person answering needs the class, the guardian's number and the history in
 * front of them without clicking anywhere.
 *
 * A 404 here is deliberately indistinguishable from "not permitted" — the API
 * answers the same way for both, because a 403 would confirm the record exists
 * (docs/11 §4).
 */
export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;

  if (session === undefined) {
    return <SignedOut />;
  }

  const result = await apiFetch<{ data: StudentProfile }>(ROUTES.students.profile(id));

  if (!result.ok && result.status === 404) {
    notFound();
  }

  const can = {
    update: session.permissions.includes('students.student.update'),
    guardians: session.permissions.includes('students.guardian.update'),
  };

  return (
    <AppShell
      user={{ name: session.name, email: session.email, roleLabel: session.roles.join(', ') }}
      school={{ name: session.school.name }}
      permissions={session.permissions}
      profileCompleted={session.profileCompleted}
      unverifiedEmail={session.emailVerified ? undefined : session.email}
    >
      {result.ok ? (
        <StudentProfileView student={result.data.data} can={can} />
      ) : (
        <EmptyState title="That did not load" description={result.message} />
      )}
    </AppShell>
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
