import { ROUTES, type SchoolListItem } from '@ilm/contracts';
import { redirect } from 'next/navigation';

import { SchoolsTable } from '@/components/schools-table';
import { apiFetch, getPlatformSession } from '@/lib/api';

/**
 * The school list.
 *
 * A server component, so the platform token never reaches the browser bundle
 * and the page arrives already rendered. The session is checked here rather
 * than in middleware because this is also where the *capabilities* come from —
 * SUPPORT can read this list and must not see an "Add school" button that would
 * only fail on submit.
 */
export default async function SchoolsPage() {
  const session = await getPlatformSession();
  if (session === undefined) {
    redirect('/login');
  }

  const result = await apiFetch<{ data: SchoolListItem[]; meta: { total: number } }>(
    `${ROUTES.platform.schools.list}?limit=100&sort=createdAt&order=desc`,
  );

  const appDomain = process.env['APP_DOMAIN'] ?? 'localhost';

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{session.name}</span> · {session.role}
        </p>
      </div>

      <SchoolsTable
        rows={result.ok ? result.data.data : []}
        total={result.ok ? result.data.meta.total : 0}
        {...(result.ok ? {} : { error: result.message })}
        appDomain={appDomain}
        canCreate={session.capabilities.includes('schools.create')}
      />
    </main>
  );
}
