import { MAX_PAGE_LIMIT, ROUTES, type StudentListItem } from '@ilm/contracts';

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

  const search = typeof params['q'] === 'string' ? params['q'] : '';
  const status = typeof params['status'] === 'string' ? params['status'] : '';

  // Paging state comes from the URL, so a page of results is a link somebody
  // can send and the back button works. Parsed defensively — these arrive from
  // whatever the address bar contains, and a negative offset or a limit of
  // 100,000 must not reach the API as-is.
  const limit = clampInt(params['limit'], PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search !== '') {
    query.set('q', search);
  }
  if (status !== '') {
    query.set('status', status);
  }

  // The class tree used to be fetched here to prime the admission dialog.
  // Admission is its own page now and fetches what it needs, so this list pays
  // for one query instead of two.
  const result = await apiFetch<{
    data: StudentListItem[];
    meta: {
      page: { total: number; limit: number; offset: number };
      aggregates: Record<string, number>;
    };
  }>(`${ROUTES.students.list}?${query.toString()}`);

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
      unverifiedEmail={session.emailVerified ? undefined : session.email}
    >
      <StudentsTable
        rows={result.ok ? result.data.data : []}
        total={result.ok ? result.data.meta.page.total : 0}
        aggregates={result.ok ? result.data.meta.aggregates : {}}
        error={result.ok ? undefined : result.message}
        search={search}
        status={status}
        isFiltered={isFiltered}
        limit={result.ok ? result.data.meta.page.limit : limit}
        offset={result.ok ? result.data.meta.page.offset : offset}
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

/** Rows per page. Well under the API's cap of 200 (docs/11 §5). */
const PAGE_LIMIT = 25;

/**
 * Read a query-string integer that a person may have typed.
 *
 * `?offset=-5` or `?limit=99999` reaching the API is a 400 the person did not
 * cause and cannot read. Clamping here turns a mangled URL into the nearest
 * sensible page instead.
 */
function clampInt(
  raw: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
