import {
  ROUTES,
  type AccessRoleList,
  type AccessUser,
  type AccessUserDetail,
} from '@ilm/contracts';
import { redirect } from 'next/navigation';

import { AccessManager } from '@/components/access-manager';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';
import { clampInt } from '@/lib/search-params';

const PEOPLE_PAGE_SIZE = 25;

/**
 * Settings › Users & Access (ADR-0025).
 *
 * Only for people who manage users. Everything about *which* roles and people
 * they may change is decided by the API by rank; this page only draws it.
 */
export default async function AccessSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('settings.user.manage')) {
    redirect('/');
  }

  const params = await searchParams;
  const tab = params['tab'] === 'people' ? 'people' : 'roles';
  const search = typeof params['q'] === 'string' ? params['q'] : '';
  const personId = typeof params['person'] === 'string' ? params['person'] : undefined;
  const offset = clampInt(params['offset'], 0, 0, Number.MAX_SAFE_INTEGER);

  const query = new URLSearchParams({ limit: String(PEOPLE_PAGE_SIZE), offset: String(offset) });
  if (search !== '') {
    query.set('search', search);
  }

  const [roles, people, person] = await Promise.all([
    apiFetch<{ data: AccessRoleList }>(ROUTES.access.roles),
    apiFetch<{
      data: AccessUser[];
      meta: { page: { total: number; limit: number; offset: number } };
    }>(`${ROUTES.access.users}?${query.toString()}`),
    personId === undefined
      ? Promise.resolve(undefined)
      : apiFetch<{ data: AccessUserDetail }>(ROUTES.access.user(personId)),
  ]);

  return (
    <>
      <WorkspacePageHeader
        title="Users & Access"
        description="Every role starts with sensible defaults. Give a role, or one person, more screens — or take away the ones they do not need. Changes apply on their next click."
      />

      <AccessManager
        tab={tab}
        roles={roles.ok ? roles.data.data.roles : []}
        rolesError={roles.ok ? undefined : roles.message}
        people={{
          rows: people.ok ? people.data.data : [],
          total: people.ok ? people.data.meta.page.total : 0,
          limit: people.ok ? people.data.meta.page.limit : PEOPLE_PAGE_SIZE,
          offset: people.ok ? people.data.meta.page.offset : offset,
          search,
        }}
        peopleError={people.ok ? undefined : people.message}
        person={person?.ok === true ? person.data.data : undefined}
        personError={
          person === undefined || person.ok
            ? undefined
            : person.status === 404
              ? 'That person is not on this list. They may have left, or their access cannot be customised.'
              : person.message
        }
        grantable={session.permissions}
      />
    </>
  );
}
