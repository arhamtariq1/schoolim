'use client';

import { STUDENT_STATUSES, type StudentListItem } from '@ilm/contracts';
import { Button, DataTable, StatusBadge, type Column } from '@ilm/ui';
import { CreateIcon, SearchIcon } from '@ilm/ui/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type FormEvent } from 'react';

/**
 * The student list.
 *
 * Filters live in the URL, not in component state: a filtered view is then a
 * link someone can paste to a colleague, it survives a refresh, and the back
 * button does what it should. `useTransition` keeps the previous rows on screen
 * while the new ones load rather than flashing a skeleton over data that is
 * about to be almost identical (docs/16 §7).
 */

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  GRADUATED: 'neutral',
  LEFT: 'warning',
  STRUCK_OFF: 'danger',
};

export interface StudentsTableProps {
  rows: StudentListItem[];
  total: number;
  aggregates: Record<string, number>;
  error?: string | undefined;
  search: string;
  status: string;
  isFiltered: boolean;
}

export function StudentsTable({
  rows,
  total,
  aggregates,
  error,
  search,
  status,
  isFiltered,
}: StudentsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function apply(next: Record<string, string>) {
    const updated = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === '') {
        updated.delete(key);
      } else {
        updated.set(key, value);
      }
    }
    startTransition(() => {
      router.replace(`${pathname}?${updated.toString()}`);
    });
  }

  const columns: Column<StudentListItem>[] = [
    {
      key: 'admissionNo',
      header: 'Admission no.',
      // Monospace and selectable: it gets read aloud and copied constantly.
      render: (row) => <span className="font-mono text-xs select-all">{row.admissionNo}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className="font-medium text-balance">
          {row.firstName} {row.lastName}
        </span>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      render: (row) =>
        row.className === null ? (
          <span className="text-muted-foreground">Not enrolled</span>
        ) : (
          <span>
            {row.className}
            {row.sectionName === null ? '' : ` — ${row.sectionName}`}
          </span>
        ),
    },
    {
      key: 'roll',
      header: 'Roll',
      align: 'end',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs tabular-nums">{row.rollNo ?? '—'}</span>,
    },
    {
      key: 'guardian',
      header: 'Guardian',
      render: (row) =>
        row.guardianName === null ? (
          // Named plainly: this is a task-queue item, not a cosmetic gap.
          <span className="text-warning">No guardian on file</span>
        ) : (
          <div>
            <div>{row.guardianName}</div>
            {row.guardianPhone === null ? null : (
              <a
                href={`tel:${row.guardianPhone}`}
                className="font-mono text-xs text-muted-foreground underline"
                onClick={(event) => {
                  // The row opens the student; the phone link must not.
                  event.stopPropagation();
                }}
              >
                {row.guardianPhone}
              </a>
            )}
          </div>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge tone={STATUS_TONE[row.status] ?? 'neutral'}>
          {row.status.toLowerCase().replace('_', ' ')}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Students</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'student' : 'students'}
            {aggregates['totalActive'] === undefined
              ? ''
              : ` · ${aggregates['totalActive']} active`}
          </p>
        </div>
        <Button disabled>
          <CreateIcon className="size-4" aria-hidden="true" />
          Admit student
        </Button>
      </header>

      <form
        role="search"
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('q');
          apply({ q: typeof value === 'string' ? value : '' });
        }}
      >
        <div className="relative min-w-56 flex-1">
          <SearchIcon
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Name or admission number"
            aria-label="Search students"
            className="h-10 w-full rounded-md border border-border bg-background ps-9 pe-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>

        <select
          name="status"
          defaultValue={status}
          aria-label="Filter by status"
          onChange={(event) => {
            apply({ status: event.target.value });
          }}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="">Any status</option>
          {STUDENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.toLowerCase().replace('_', ' ')}
            </option>
          ))}
        </select>

        <Button type="submit" tone="outline" isPending={isPending}>
          Search
        </Button>
      </form>

      <div
        aria-busy={isPending}
        className={isPending ? 'opacity-60 transition-opacity' : undefined}
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          caption="Students"
          {...(error === undefined ? {} : { error })}
          isFiltered={isFiltered}
          onClearFilters={() => {
            apply({ q: '', status: '' });
          }}
          empty={{
            title: 'No students yet',
            description:
              'A student is admitted with an admission number, a class and a guardian. Admitting the first one takes about a minute.',
          }}
        />
      </div>
    </div>
  );
}
