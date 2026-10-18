import {
  MAX_PAGE_LIMIT,
  ROUTES,
  TIMETABLE_SORT_FIELDS,
  type TimetableListItem,
  type TimetableOptions,
} from '@ilm/contracts';
import type { Metadata } from 'next';

import { TimetablesView } from '@/components/timetables-view';
import { apiFetch } from '@/lib/api';
import { DEFAULT_LIST_PAGE_SIZE, parseSortField, parseSortOrder } from '@/lib/list-page';
import { clampInt, readParam } from '@/lib/search-params';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Timetables' };

/**
 * Timetables.
 *
 * One route for everyone. The office (`academics.timetable.configure`) sees
 * every timetable, drafts included, and gets the form's options; a teacher, a
 * parent or a student gets only the published ones that concern them. The API
 * decides which — this only reads the same permission to decide what to draw.
 *
 * Filters, sort and paging live in the query string, so "Class 5 exams" is a link.
 */
export default async function TimetablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const canManage = session?.permissions.includes('academics.timetable.configure') ?? false;

  const filters = {
    q: readParam(params, 'q'),
    sessionId: readParam(params, 'sessionId'),
    classLevelId: readParam(params, 'classLevelId'),
    kind: readParam(params, 'kind'),
    assessmentTypeId: readParam(params, 'assessmentTypeId'),
    status: canManage ? readParam(params, 'status') : '',
  };
  const limit = clampInt(params['limit'], DEFAULT_LIST_PAGE_SIZE, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);
  const sort = parseSortField(params['sort'], TIMETABLE_SORT_FIELDS, 'updatedAt');
  const order = params['order'] === undefined ? 'desc' : parseSortOrder(params['order']);

  const query = new URLSearchParams({ limit: String(limit), offset: String(offset), sort, order });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }

  const [listResult, optionsResult] = await Promise.all([
    apiFetch<{ data: TimetableListItem[]; meta: { page: { total: number } } }>(
      `${ROUTES.timetables.list}?${query.toString()}`,
    ),
    canManage ? apiFetch<{ data: TimetableOptions }>(ROUTES.timetables.options) : Promise.resolve(undefined),
  ]);

  return (
    <TimetablesView
      canManage={canManage}
      rows={listResult.ok ? listResult.data.data : []}
      total={listResult.ok ? listResult.data.meta.page.total : 0}
      filters={filters}
      sort={sort}
      order={order}
      limit={limit}
      offset={offset}
      options={optionsResult?.ok === true ? optionsResult.data.data : undefined}
      error={listResult.ok ? undefined : listResult.message}
    />
  );
}
