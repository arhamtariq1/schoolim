import { ROUTES, schoolListQuerySchema, type SchoolListItem } from '@ilm/contracts';
import { PermissionDeniedState } from '@ilm/ui';

import { SchoolsTable } from '@/components/schools-table';
import { apiFetch, getPlatformSession } from '@/lib/api';

export const metadata = { title: 'Schools' };

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/**
 * The school list.
 *
 * A server component, so the platform token never reaches the browser bundle
 * and the page arrives already rendered. The URL is parsed with the same schema
 * the API uses; a hand-edited or stale link (`?status=nope`, `?offset=-4`)
 * falls back to the unfiltered first page rather than a blank error.
 */
export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getPlatformSession();
  if (session === undefined || !session.capabilities.includes('schools.read')) {
    return <PermissionDeniedState />;
  }

  const raw = await searchParams;
  const base = { limit: PAGE_SIZE, sort: 'createdAt', order: 'desc' } as const;
  const requested = schoolListQuerySchema.safeParse({
    ...base,
    ...(first(raw['q']) === '' ? {} : { q: first(raw['q']) }),
    ...(first(raw['status']) === '' ? {} : { status: first(raw['status']) }),
    ...(first(raw['offset']) === '' ? {} : { offset: first(raw['offset']) }),
  });
  const query = requested.success ? requested.data : schoolListQuerySchema.parse(base);

  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset),
    sort: query.sort,
    order: query.order,
  });
  if (query.q !== undefined) params.set('q', query.q);
  if (query.status !== undefined) params.set('status', query.status);

  const result = await apiFetch<{ data: SchoolListItem[]; meta: { total: number } }>(
    `${ROUTES.platform.schools.list}?${params.toString()}`,
  );

  return (
    <SchoolsTable
      rows={result.ok ? result.data.data : []}
      total={result.ok ? result.data.meta.total : 0}
      limit={query.limit}
      offset={query.offset}
      q={query.q ?? ''}
      status={query.status ?? ''}
      {...(result.ok ? {} : { error: result.message })}
      appDomain={process.env['APP_DOMAIN'] ?? 'localhost'}
      canCreate={session.capabilities.includes('schools.create')}
    />
  );
}
