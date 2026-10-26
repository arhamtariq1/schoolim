'use client';

import {
  ACCESS_ROLE_DETAILS,
  NO_OVERRIDES,
  roleGrants,
  ROUTES,
  sameOverrides,
  SCHOOL_ROLE_LABELS,
  withPermission,
  type AccessRole,
  type AccessUser,
  type AccessUserDetail,
  type CustomizableRole,
  type EffectiveGrants,
  type Permission,
  type PermissionGrant,
  type PermissionOverrides,
} from '@ilm/contracts';
import {
  Button,
  cardSurfaceClassName,
  cn,
  EmptyState,
  ErrorState,
  FieldIconWrap,
  FloatingActionBar,
  Input,
  NoResultsState,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useDebouncedSearch,
  useToast,
} from '@ilm/ui';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ICON_SIZE,
  LockedIcon,
  SaveIcon,
  SearchIcon,
  UndoIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { AccessPermissionGrid } from '@/components/access-permission-grid';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

type Tab = 'roles' | 'people';

export interface AccessPeoplePage {
  readonly rows: readonly AccessUser[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly search: string;
}

/**
 * Settings › Users & Access (ADR-0025).
 *
 * Two levels, in the order a school thinks about them: first what each **role**
 * can open, then exceptions for one **person**. Both start from a default and
 * record only the difference, so "Reset to default" is always one click and the
 * badges always say what this school changed.
 *
 * The people list, the search and the chosen person live in the URL and are
 * fetched by the page, like every other list in the portal — so a link to one
 * teacher's access can be sent to a colleague, and nothing fetches in an effect.
 */
export function AccessManager({
  tab,
  roles,
  rolesError,
  people,
  peopleError,
  person,
  personError,
  grantable,
}: {
  readonly tab: Tab;
  readonly roles: readonly AccessRole[];
  readonly rolesError: string | undefined;
  readonly people: AccessPeoplePage;
  readonly peopleError: string | undefined;
  readonly person: AccessUserDetail | undefined;
  readonly personError: string | undefined;
  readonly grantable: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const grantableSet = useMemo(() => new Set(grantable), [grantable]);

  function go(next: Record<string, string | undefined>): void {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    const text = query.toString();
    router.push(text === '' ? pathname : `${pathname}?${text}`, { scroll: false });
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        go({ tab: value === 'people' ? 'people' : undefined });
      }}
    >
      <TabsList>
        <TabsTrigger value="roles">Roles</TabsTrigger>
        <TabsTrigger value="people">People</TabsTrigger>
      </TabsList>

      <TabsContent value="roles" className="mt-6">
        {rolesError === undefined ? (
          <RolesPanel roles={roles} grantable={grantableSet} />
        ) : (
          <ErrorState
            title="Roles did not load"
            description={rolesError}
            onRetry={() => {
              router.refresh();
            }}
          />
        )}
      </TabsContent>

      <TabsContent value="people" className="mt-6">
        <PeoplePanel
          people={people}
          peopleError={peopleError}
          person={person}
          personError={personError}
          grantable={grantableSet}
          go={go}
        />
      </TabsContent>
    </Tabs>
  );
}

// --- Roles --------------------------------------------------------------------

function RolesPanel({
  roles,
  grantable,
}: {
  readonly roles: readonly AccessRole[];
  readonly grantable: ReadonlySet<string>;
}) {
  const toast = useToast();
  const router = useRouter();
  const [selected, setSelected] = useState<CustomizableRole | undefined>(
    () => (roles.find((entry) => entry.editable) ?? roles[0])?.role,
  );
  // Saved state is kept locally as well as in props so the bar clears the
  // moment a save lands, not after the refresh that follows it.
  const [saved, setSaved] = useState<Partial<Record<CustomizableRole, PermissionOverrides>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<CustomizableRole, PermissionOverrides>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const current = roles.find((entry) => entry.role === selected);
  if (current === undefined) {
    return (
      <EmptyState
        title="No roles to customise"
        description="Roles appear here once your school has staff roles to give access to."
      />
    );
  }

  const role = current.role;
  const savedOverrides = saved[role] ?? current.overrides;
  const draft = drafts[role] ?? savedOverrides;
  const base = roleGrants(role);
  const dirty = !sameOverrides(draft, savedOverrides);
  const label = ACCESS_ROLE_DETAILS[role].label;
  const changeCount = draft.grant.length + draft.revoke.length;

  async function save(): Promise<void> {
    setIsSaving(true);
    const result = await mutate<{ data: AccessRole }>(ROUTES.access.role(role), 'PUT', draft);
    setIsSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setSaved((previous) => ({ ...previous, [role]: result.data.data.overrides }));
    setDrafts((previous) => ({ ...previous, [role]: undefined }));
    toast.success(`${label} access saved. It applies from their next click.`);
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" role="list">
        {roles.map((entry) => {
          const overrides = drafts[entry.role] ?? saved[entry.role] ?? entry.overrides;
          const changes = overrides.grant.length + overrides.revoke.length;
          const unsaved =
            drafts[entry.role] !== undefined &&
            !sameOverrides(drafts[entry.role] ?? NO_OVERRIDES, saved[entry.role] ?? entry.overrides);
          const active = entry.role === role;

          return (
            <button
              key={entry.role}
              type="button"
              role="listitem"
              aria-pressed={active}
              onClick={() => {
                setSelected(entry.role);
              }}
              className={cn(
                'flex min-h-11 flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-start transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50',
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {ACCESS_ROLE_DETAILS[entry.role].label}
                </span>
                {entry.editable ? null : (
                  <LockedIcon className={cn(ICON_SIZE.inline, 'text-muted-foreground')} aria-label="View only" />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {unsaved ? 'Unsaved changes' : changes === 0 ? 'Default' : `${String(changes)} changed`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{label}</h2>
          <p className="text-sm text-muted-foreground">
            {ACCESS_ROLE_DETAILS[role].description}. Applies to everyone with this role.
          </p>
        </div>
        {current.editable && changeCount > 0 ? (
          <Button
            tone="outline"
            onClick={() => {
              setDrafts((previous) => ({ ...previous, [role]: NO_OVERRIDES }));
            }}
          >
            <UndoIcon className={ICON_SIZE.inline} aria-hidden="true" />
            Reset to default
          </Button>
        ) : null}
      </div>

      {current.editable ? null : <ViewOnlyNotice />}

      <AccessPermissionGrid
        base={base}
        overrides={draft}
        editable={current.editable && !isSaving}
        grantable={grantable}
        onToggle={(permission, on) => {
          setDrafts((previous) => ({
            ...previous,
            [role]: withPermission(base, draft, permission, on),
          }));
        }}
      />

      {dirty ? (
        <SaveBar
          message={`Unsaved changes to ${label} access`}
          isSaving={isSaving}
          onDiscard={() => {
            setDrafts((previous) => ({ ...previous, [role]: undefined }));
          }}
          onSave={() => {
            void save();
          }}
        />
      ) : null}
    </div>
  );
}

// --- People -------------------------------------------------------------------

function PeoplePanel({
  people,
  peopleError,
  person,
  personError,
  grantable,
  go,
}: {
  readonly people: AccessPeoplePage;
  readonly peopleError: string | undefined;
  readonly person: AccessUserDetail | undefined;
  readonly personError: string | undefined;
  readonly grantable: ReadonlySet<string>;
  readonly go: (next: Record<string, string | undefined>) => void;
}) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const { searchQuery, onSearchQueryChange } = useDebouncedSearch(people.search, (value) => {
    go({ q: value.trim(), offset: undefined });
  });

  const firstUse = people.total === 0 && people.search === '';
  const from = people.total === 0 ? 0 : people.offset + 1;
  const to = Math.min(people.offset + people.limit, people.total);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-3">
        <FieldIconWrap icon={SearchIcon}>
          <Input
            type="search"
            aria-label="Search people by name or email"
            placeholder="Search by name or email"
            value={searchQuery}
            onChange={(event) => {
              onSearchQueryChange(event.target.value);
            }}
          />
        </FieldIconWrap>

        {peopleError !== undefined ? (
          <ErrorState
            title="People did not load"
            description={peopleError}
            onRetry={() => {
              router.refresh();
            }}
          />
        ) : firstUse ? (
          <EmptyState
            title="No staff accounts yet"
            description="People appear here once they have a portal account. Add staff and send them an invitation first."
            action={
              <Button asChild tone="outline">
                <Link href={tenantHref('/staff')}>Go to Staff</Link>
              </Button>
            }
          />
        ) : people.rows.length === 0 ? (
          <NoResultsState
            onClearFilters={() => {
              onSearchQueryChange('');
              go({ q: undefined, offset: undefined });
            }}
          />
        ) : (
          <>
            <ul className={cn(cardSurfaceClassName, 'divide-y divide-border/60 overflow-hidden')}>
              {people.rows.map((row) => {
                const active = row.id === person?.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => {
                        go({ person: row.id });
                      }}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 px-4 py-3 text-start transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
                        active ? 'bg-primary/10' : 'hover:bg-muted',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground" title={row.name}>
                          {row.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.roles.map((held) => SCHOOL_ROLE_LABELS[held]).join(', ')}
                        </span>
                      </span>
                      {row.changedCount > 0 ? (
                        <StatusBadge tone="success">{row.changedCount} changed</StatusBadge>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {from}–{to} of {people.total}
              </span>
              <span className="flex gap-1">
                <Button
                  tone="ghost"
                  size="sm"
                  aria-label="Previous page"
                  disabled={people.offset === 0}
                  onClick={() => {
                    go({ offset: String(Math.max(0, people.offset - people.limit)) });
                  }}
                >
                  <ChevronLeftIcon className={ICON_SIZE.inline} aria-hidden="true" />
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  aria-label="Next page"
                  disabled={to >= people.total}
                  onClick={() => {
                    go({ offset: String(people.offset + people.limit) });
                  }}
                >
                  <ChevronRightIcon className={ICON_SIZE.inline} aria-hidden="true" />
                </Button>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="min-w-0 lg:col-span-2">
        {personError !== undefined ? (
          <ErrorState
            title="That person’s access did not load"
            description={personError}
            onRetry={() => {
              router.refresh();
            }}
          />
        ) : person === undefined ? (
          <EmptyState
            title="Choose a person"
            description="Give one person a screen their role does not have, or take one away, without changing anyone else with the same role."
          />
        ) : (
          // Keyed so a different person starts from their own saved state.
          <PersonEditor key={person.id} person={person} grantable={grantable} />
        )}
      </div>
    </div>
  );
}

function PersonEditor({
  person,
  grantable,
}: {
  readonly person: AccessUserDetail;
  readonly grantable: ReadonlySet<string>;
}) {
  const toast = useToast();
  const router = useRouter();
  const base: EffectiveGrants = useMemo(
    () =>
      new Map<Permission, PermissionGrant>(
        person.roleGrants.map((entry) => [entry.permission, entry.grant]),
      ),
    [person.roleGrants],
  );
  const [saved, setSaved] = useState<PermissionOverrides>(person.overrides);
  const [draft, setDraft] = useState<PermissionOverrides>(person.overrides);
  const [isSaving, setIsSaving] = useState(false);

  const dirty = !sameOverrides(draft, saved);
  const changeCount = draft.grant.length + draft.revoke.length;

  async function save(): Promise<void> {
    setIsSaving(true);
    const result = await mutate<{ data: AccessUserDetail }>(ROUTES.access.user(person.id), 'PUT', draft);
    setIsSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setSaved(result.data.data.overrides);
    setDraft(result.data.data.overrides);
    toast.success(`${person.name}’s access saved. It applies from their next click.`);
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-foreground" title={person.name}>
            {person.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {person.roles.map((held) => SCHOOL_ROLE_LABELS[held]).join(', ')} · starts from what
            their {person.roles.length > 1 ? 'roles give' : 'role gives'}, changed for this person only.
          </p>
        </div>
        {person.editable && changeCount > 0 ? (
          <Button
            tone="outline"
            onClick={() => {
              setDraft(NO_OVERRIDES);
            }}
          >
            <UndoIcon className={ICON_SIZE.inline} aria-hidden="true" />
            Reset to role default
          </Button>
        ) : null}
      </div>

      {person.editable ? null : <ViewOnlyNotice person />}

      <AccessPermissionGrid
        base={base}
        overrides={draft}
        editable={person.editable && !isSaving}
        grantable={grantable}
        onToggle={(permission, on) => {
          setDraft((current) => withPermission(base, current, permission, on));
        }}
      />

      {dirty ? (
        <SaveBar
          message={`Unsaved changes to ${person.name}’s access`}
          isSaving={isSaving}
          onDiscard={() => {
            setDraft(saved);
          }}
          onSave={() => {
            void save();
          }}
        />
      ) : null}
    </div>
  );
}

// --- Shared -------------------------------------------------------------------

function ViewOnlyNotice({ person = false }: { readonly person?: boolean }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      <LockedIcon className={cn(ICON_SIZE.inline, 'mt-0.5 shrink-0')} aria-hidden="true" />
      {person
        ? 'View only. You cannot change your own access, or that of someone whose role is at or above yours.'
        : 'View only. You can change roles below your own; ask someone more senior to change this one.'}
    </p>
  );
}

function SaveBar({
  message,
  isSaving,
  onDiscard,
  onSave,
}: {
  readonly message: string;
  readonly isSaving: boolean;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
}) {
  return (
    <FloatingActionBar
      message={message}
      actions={
        <>
          <Button tone="ghost" size="sm" disabled={isSaving} onClick={onDiscard}>
            Discard
          </Button>
          <Button size="sm" isPending={isSaving} disabled={isSaving} onClick={onSave}>
            <SaveIcon className={ICON_SIZE.inline} aria-hidden="true" />
            Save changes
          </Button>
        </>
      }
    />
  );
}
