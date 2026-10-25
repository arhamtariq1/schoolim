import { MAX_PAGE_LIMIT, ROUTES, type StaffListItem } from '@ilm/contracts';

import { StaffTable } from '@/components/staff-table';
import { apiFetch } from '@/lib/api';
import {
  DEFAULT_LIST_PAGE_SIZE,
  parseNewestFirstOrder,
  parseSortField,
} from '@/lib/list-page';
import { clampInt } from '@/lib/search-params';
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
  const gender = typeof params['gender'] === 'string' ? params['gender'] : '';

  const limit = clampInt(params['limit'], DEFAULT_LIST_PAGE_SIZE, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);
  const sort = parseSortField(
    params['sort'],
    ['name', 'employeeNo', 'role', 'createdAt'] as const,
    'createdAt',
  );
  const order = parseNewestFirstOrder(params);

  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    sort,
    order,
  });
  if (search !== '') {
    query.set('q', search);
  }
  if (role !== '') {
    query.set('role', role);
  }
  if (gender !== '') {
    query.set('gender', gender);
  }

  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{
      data: StaffListItem[];
      meta: { page: { total: number; limit: number; offset: number } };
    }>(`${ROUTES.staff.list}?${query.toString()}`),
  ]);

  return (
    <StaffTable
        rows={result.ok ? result.data.data : []}
        total={result.ok ? result.data.meta.page.total : 0}
        limit={result.ok ? result.data.meta.page.limit : limit}
        offset={result.ok ? result.data.meta.page.offset : offset}
        error={result.ok ? undefined : result.message}
        search={search}
        role={role}
        gender={gender}
        sort={sort}
        order={order}
        canManage={session?.permissions.includes('staff.record.update') ?? false}
      />
  );
}
