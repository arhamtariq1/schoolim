import { MAX_PAGE_LIMIT, ROUTES, type StaffListItem } from '@ilm/contracts';

import { AppShell } from '@/components/app-shell';
import { StaffTable } from '@/components/staff-table';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Staff — everybody on the payroll, whether or not they use the portal. */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const search = typeof params['q'] === 'string' ? params['q'] : '';
  const role = typeof params['role'] === 'string' ? params['role'] : '';

  const limit = clampInt(params['limit'], 25, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (search !== '') {
    query.set('q', search);
  }
  if (role !== '') {
    query.set('role', role);
  }

  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{
      data: StaffListItem[];
      meta: { page: { total: number; limit: number; offset: number } };
    }>(`${ROUTES.staff.list}?${query.toString()}`),
  ]);

  return (
    <AppShell
      user={{ name: session?.name ?? '', email: session?.email ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      profileCompleted={session?.profileCompleted ?? true}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <StaffTable
        rows={result.ok ? result.data.data : []}
        total={result.ok ? result.data.meta.page.total : 0}
        limit={result.ok ? result.data.meta.page.limit : limit}
        offset={result.ok ? result.data.meta.page.offset : offset}
        error={result.ok ? undefined : result.message}
        search={search}
        role={role}
        canManage={session?.permissions.includes('staff.record.update') ?? false}
      />
    </AppShell>
  );
}

/** See the note on the students page: a mangled URL becomes a sensible page. */
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
