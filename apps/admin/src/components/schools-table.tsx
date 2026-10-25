'use client';

import { SCHOOL_STATUSES, type SchoolListItem } from '@ilm/contracts';
import {
  buttonVariants,
  DataTable,
  DateDisplay,
  ListPageToolbar,
  Pagination,
  SimpleSelect,
  type Column,
} from '@ilm/ui';
import { CreateIcon, FilterIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { SchoolStatusBadge, STATUS_LABEL } from '@/components/school-status';

/**
 * Every school on the platform.
 *
 * Counts, not contents. This screen says how many students a school has and
 * never who they are: an operator who needs a school's actual records has to
 * impersonate, which is consented and audited (docs/17 §5). Making the tenant
 * list browsable and the tenant data not is the whole design.
 *
 * Search, filter and page all live in the URL, so a filtered list can be sent
 * to a colleague and survives a refresh. This component only writes the URL;
 * the server page reads it and fetches.
 */

const SEARCH_DEBOUNCE_MS = 300;

export interface SchoolsTableProps {
  rows: SchoolListItem[];
  total: number;
  limit: number;
  offset: number;
  q: string;
  status: string;
  error?: string | undefined;
  appDomain: string;
  canCreate: boolean;
}

export function SchoolsTable({
  rows,
  total,
  limit,
  offset,
  q,
  status,
  error,
  appDomain,
  canCreate,
}: SchoolsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The URL is the source of truth: back and forward must update the box.
  useEffect(() => {
    setSearch(q);
  }, [q]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  function navigate(next: { q?: string; status?: string; offset?: number }) {
    const params = new URLSearchParams();
    const nextQ = (next.q ?? q).trim();
    const nextStatus = next.status ?? status;
    if (nextQ !== '') params.set('q', nextQ);
    if (nextStatus !== '') params.set('status', nextStatus);
    // Changing what is searched resets the page: page 4 of a result set that
    // now has two pages is an empty screen.
    const nextOffset = next.offset ?? 0;
    if (nextOffset > 0) params.set('offset', String(nextOffset));
    const query = params.toString();
    router.replace((query === '' ? pathname : `${pathname}?${query}`), { scroll: false });
  }

  function onSearch(value: string) {
    setSearch(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      navigate({ q: value });
    }, SEARCH_DEBOUNCE_MS);
  }

  const columns: Column<SchoolListItem>[] = [
    {
      key: 'name',
      header: 'School',
      render: (row) => (
        <div>
          <div className="font-medium text-balance">{row.name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {row.slug}.{appDomain}
          </div>
        </div>
      ),
    },
    {
      key: 'city',
      header: 'City',
      hideOnMobile: true,
      render: (row) =>
        row.city === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span>{row.city}</span>
        ),
    },
    {
      key: 'students',
      header: 'Students',
      align: 'end',
      render: (row) => <span className="font-mono text-xs tabular-nums">{row.studentCount}</span>,
    },
    {
      key: 'users',
      header: 'Staff',
      align: 'end',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs tabular-nums">{row.userCount}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <SchoolStatusBadge status={row.status} /> },
    {
      key: 'trialEndsAt',
      header: 'Trial ends',
      hideOnMobile: true,
      render: (row) =>
        row.status === 'TRIAL' && row.trialEndsAt !== null ? (
          <DateDisplay value={row.trialEndsAt} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Added',
      hideOnMobile: true,
      render: (row) => <DateDisplay value={row.createdAt} />,
    },
  ];

  const isFiltered = q !== '' || status !== '';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Schools</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'school' : 'schools'}
            {isFiltered ? ' match' : ' on the platform'}
          </p>
        </div>
        {canCreate ? (
          // A real link, not a button with an onClick: middle-click and
          // "open in new tab" have to work on a navigation.
          <Link href="/schools/new" className={buttonVariants()}>
            <CreateIcon className="size-4" aria-hidden="true" />
            Add school
          </Link>
        ) : null}
      </header>

      <ListPageToolbar
        searchQuery={search}
        onSearchQueryChange={onSearch}
        searchPlaceholder="Search by name or short name"
        searchAriaLabel="Search schools"
        filters={
          <SimpleSelect
            value={status}
            onValueChange={(value) => {
              navigate({ status: value });
            }}
            options={SCHOOL_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))}
            emptyOption={{ value: '', label: 'All statuses' }}
            ariaLabel="Filter by status"
            triggerIcon={FilterIcon}
            className="w-44"
          />
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption="Schools"
        isFiltered={isFiltered}
        onClearFilters={() => {
          setSearch('');
          router.replace(pathname, { scroll: false });
        }}
        {...(error === undefined ? {} : { error })}
        empty={{
          title: 'No schools yet',
          description:
            'Adding a school creates its address and its first owner account in one step. It takes about a minute.',
        }}
      />

      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        label="schools"
        onChange={(next) => {
          navigate({ offset: next });
        }}
      />
    </div>
  );
}
