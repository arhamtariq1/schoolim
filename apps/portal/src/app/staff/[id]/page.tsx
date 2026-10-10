import { ROUTES, type StaffProfile } from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import { notFound } from 'next/navigation';

import { StaffProfileView } from '@/components/staff-profile-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** One staff member — contact, employment, and documents on file. */
export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;

  if (session === undefined) {
    return <SignedOut />;
  }

  const result = await apiFetch<{ data: StaffProfile }>(ROUTES.staff.detail(id));

  if (!result.ok && result.status === 404) {
    notFound();
  }

  const canManage = session.permissions.includes('staff.record.update');

  return result.ok ? (
    <StaffProfileView profile={result.data.data} canManage={canManage} />
  ) : (
    <EmptyState title="That did not load" description={result.message} />
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
