import {
  ROUTES,
  type ClassLevelWithSections,
  type CurrentSession,
  type StudentListItem,
} from '@ilm/contracts';

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

  // Both in parallel: the admission form needs the class tree, and fetching it
  // only when the dialog opens means the first click waits on a round trip that
  // could have happened while the page was already loading.
  const [result, setup] = await Promise.all([
    apiFetch<{
      data: StudentListItem[];
      meta: { page: { total: number }; aggregates: Record<string, number> };
    }>(`${ROUTES.students.list}?${query.toString()}`),
    apiFetch<{
      data: { session: CurrentSession | null; classes: ClassLevelWithSections[] };
    }>(ROUTES.academics.setup),
  ]);

  const isFiltered = search !== '' || status !== '';

  // The menu hides what the API would refuse anyway. The API is the authority —
  // a permission check that happens only in the UI does not exist (docs/08) —
  // but showing an action that always fails is its own kind of broken.
  const can = {
    create: session.permissions.includes('students.student.create'),
    update: session.permissions.includes('students.student.update'),
    delete: session.permissions.includes('students.student.delete'),
  };

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
        classes={setup.ok ? setup.data.data.classes : []}
        sessionId={setup.ok ? (setup.data.data.session?.id ?? undefined) : undefined}
        can={can}
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
