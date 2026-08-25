import { ROUTES, type StudentListItem } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { StudentsTable } from '@/components/students-table';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * The student list.
 *
 * Rendered on the server, deliberately. The session lives in an httpOnly
 * cookie, so fetching here means the token is never handed to client
 * JavaScript — an XSS on this page cannot read it, and there is no API token in
 * the browser bundle to steal (docs/11 §8).
 *
 * Filtering and search are URL search params rather than client state, so a
 * filtered list is a shareable link, survives a refresh, and is back-button
 * correct — which is what reception actually needs when they paste a view to a
 * colleague.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  const params = await searchParams;

  if (session === undefined) {
    // Middleware normally catches this; rendering a signed-out shell rather
    // than leaking an empty grid is the safe fallback.
    return <SignedOut />;
  }

  const query = new URLSearchParams();
  const search = typeof params['q'] === 'string' ? params['q'] : '';
  const status = typeof params['status'] === 'string' ? params['status'] : '';
  if (search !== '') {
    query.set('q', search);
  }
  if (status !== '') {
    query.set('status', status);
  }

  const result = await apiFetch<{
    data: StudentListItem[];
    meta: { page: { total: number }; aggregates: Record<string, number> };
  }>(`${ROUTES.students.list}?${query.toString()}`);

  const isFiltered = search !== '' || status !== '';

  return (
    <AppShell
      user={{ name: session.name, roleLabel: session.roles.join(', ') }}
      school={{ name: session.school.name }}
      permissions={session.permissions}
    >
      <StudentsTable
        rows={result.ok ? result.data.data : []}
        total={result.ok ? result.data.meta.page.total : 0}
        aggregates={result.ok ? result.data.meta.aggregates : {}}
        error={result.ok ? undefined : result.message}
        search={search}
        status={status}
        isFiltered={isFiltered}
      />
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
