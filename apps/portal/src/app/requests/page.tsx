import {
  MAX_PAGE_LIMIT,
  REQUEST_SORT_FIELDS,
  ROUTES,
  type RequestAssigneeOption,
  type RequestListItem,
  type RequestSummary,
} from '@ilm/contracts';
import type { Metadata } from 'next';

import { RequestsView } from '@/components/requests-view';
import { apiFetch } from '@/lib/api';
import { DEFAULT_LIST_PAGE_SIZE, parseSortField, parseSortOrder } from '@/lib/list-page';
import { loadParentChildren } from '@/lib/parent-children';
import { clampInt, readParam } from '@/lib/search-params';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Requests' };

const EMPTY_SUMMARY: RequestSummary = {
  total: 0,
  pending: 0,
  inProgress: 0,
  resolved: 0,
  rejected: 0,
  reopened: 0,
};

/**
 * Requests.
 *
 * One route, two screens. Anyone who holds `workflow.request.manage` — the
 * Admin, Principal and Office Staff — gets **Manage Requests**, the school's
 * whole queue; everyone else gets **My Requests**. The server reads the same
 * permission to decide what the API returns, so this only chooses the title and
 * the columns: it is not what keeps one parent out of another's requests.
 *
 * Filters, sort and paging live in the query string, and the server does the
 * filtering, so "unassigned and urgent" is a link.
 */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const canManage = session?.permissions.includes('workflow.request.manage') ?? false;

  const filters = {
    q: readParam(params, 'q'),
    status: readParam(params, 'status'),
    category: readParam(params, 'category'),
    priority: readParam(params, 'priority'),
    assignee: canManage ? readParam(params, 'assignee') : '',
  };
  const limit = clampInt(params['limit'], DEFAULT_LIST_PAGE_SIZE, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);
  const sort = parseSortField(params['sort'], REQUEST_SORT_FIELDS, 'lastActivityAt');
  // Newest activity first by default; a column header flips it.
  const order = params['order'] === undefined ? 'desc' : parseSortOrder(params['order']);

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset), sort, order });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }
  // A parent who has chosen one child in the header sees requests about that child,
  // and counts that match. The API narrows inside what they could already see.
  const family =
    !canManage && session?.permissions.includes('parent.child.read') === true
      ? await loadParentChildren()
      : undefined;
  const child = family?.selected;
  const summaryQuery = child === undefined ? '' : `?studentId=${child.id}`;
  if (child !== undefined) {
    query.set('studentId', child.id);
  }

  const [listResult, summaryResult, assigneesResult] = await Promise.all([
    apiFetch<{ data: RequestListItem[]; meta: { page: { total: number } } }>(
      `${ROUTES.requests.list}?${query.toString()}`,
    ),
    apiFetch<{ data: RequestSummary }>(`${ROUTES.requests.summary}${summaryQuery}`),
    canManage
      ? apiFetch<{ data: RequestAssigneeOption[] }>(ROUTES.requests.assignees)
      : Promise.resolve(undefined),
  ]);

  return (
    <RequestsView
      mode={canManage ? 'manage' : 'mine'}
      rows={listResult.ok ? listResult.data.data : []}
      total={listResult.ok ? listResult.data.meta.page.total : 0}
      summary={summaryResult.ok ? summaryResult.data.data : EMPTY_SUMMARY}
      filters={filters}
      sort={sort}
      order={order}
      limit={limit}
      offset={offset}
      assignees={assigneesResult?.ok === true ? assigneesResult.data.data : []}
      parent={
        family === undefined
          ? undefined
          : {
              children: family.kids.map((kid) => ({ id: kid.id, name: kid.name })),
              selected: child === undefined ? undefined : { id: child.id, name: child.name },
            }
      }
      error={listResult.ok ? undefined : listResult.message}
    />
  );
}
