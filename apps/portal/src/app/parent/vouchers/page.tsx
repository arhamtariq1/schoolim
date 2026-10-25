import {
  PARENT_VOUCHER_PAGE_SIZE,
  PARENT_VOUCHER_SORT_FIELDS,
  ROUTES,
  type ParentVoucherList,
} from '@ilm/contracts';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ParentVouchersView } from '@/components/parent-vouchers-view';
import { apiFetch } from '@/lib/api';
import { parseSortField, parseSortOrder } from '@/lib/list-page';
import { loadParentChildren } from '@/lib/parent-children';
import { requireSchoolSession } from '@/lib/require-session';
import { clampInt, readParam } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Fee vouchers' };

/**
 * A parent's fee vouchers, filtered by child, fee month and payment status.
 *
 * The child is the one chosen in the header (`loadParentChildren`), which holds
 * on every parent page; month, status and search live in the query string, so
 * "October, unpaid" is a link. The API starts every query at the signed-in
 * guardian; a child that is not theirs answers 404 and the list is shown empty
 * with the error.
 */
export default async function ParentVouchersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('parent.voucher.read')) {
    redirect('/');
  }

  const [params, family] = await Promise.all([searchParams, loadParentChildren()]);
  const filters = {
    q: readParam(params, 'q'),
    studentId: family.selected?.id ?? '',
    month: readParam(params, 'month'),
    status: readParam(params, 'status'),
  };
  const limit = clampInt(params['limit'], PARENT_VOUCHER_PAGE_SIZE, 1, 100);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const sort = parseSortField(params['sort'], PARENT_VOUCHER_SORT_FIELDS, 'issueDate');
  // Newest first unless somebody sorted the other way.
  const order = params['order'] === undefined ? 'desc' : parseSortOrder(params['order']);

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset), sort, order });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }

  const result = await apiFetch<{ data: ParentVoucherList }>(
    `${ROUTES.parent.vouchers}?${query.toString()}`,
  );
  const data = result.ok ? result.data.data : undefined;

  return (
    <ParentVouchersView
      rows={data?.items ?? []}
      total={data?.total ?? 0}
      months={data?.months ?? []}
      filters={filters}
      limit={limit}
      offset={offset}
      sort={sort}
      order={order}
      openId={readParam(params, 'open') === '' ? undefined : readParam(params, 'open')}
      error={result.ok ? undefined : result.message}
    />
  );
}
