'use client';

import {
  type AssessmentListItem,
  type AssessmentTypeItem,
  type SubjectItem,
} from '@ilm/contracts';
import {
  Button,
  DateDisplay,
  DropdownMenuItem,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  type CardTableColumn,
} from '@ilm/ui';
import { ClassIcon, CreateIcon, EditIcon, SettingsIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { ListDataTable } from './list-data-table';
import { ListTableRowActions } from './list-table-row-actions';
import { ListTableScreen } from './list-table-screen';

import {
  FEE_LIST_TABLE_CELL,
  LIST_TABLE_BADGE_CLASS,
  afterMenuAction,
  classBadgeTone,
  feeListTableHeader,
} from '@/components/fees/fee-list-shared';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { useTenantHref } from '@/lib/use-tenant-href';

interface MarksListViewProps {
  readonly items: readonly AssessmentListItem[];
  readonly classes: readonly { id: string; name: string }[];
  readonly subjects: readonly SubjectItem[];
  readonly types: readonly AssessmentTypeItem[];
  readonly filters: { classLevelId: string; subjectId: string; assessmentTypeId: string };
  readonly can: { enter: boolean; setup: boolean };
  readonly error: string | undefined;
}

/**
 * Marks › list of tests and exams.
 *
 * The same list card as students and fee vouchers: search and filters on top,
 * one table, a ⋮ menu per row. Class, subject and type filters live in the URL
 * so a filtered list is a link. What is listed was already narrowed by the API
 * to the caller's classes — a teacher is never sent another class's tests, so
 * there is nothing here to hide.
 */
export function MarksListView({ items, classes, subjects, types, filters, can, error }: MarksListViewProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const [search, setSearch] = useState('');

  const isFiltered =
    search.trim() !== '' ||
    filters.classLevelId !== '' ||
    filters.subjectId !== '' ||
    filters.assessmentTypeId !== '';

  function apply(next: Partial<typeof filters>): void {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '') {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.push(tenantHref(`/marks${query === '' ? '' : `?${query}`}`));
  }

  function clearFilters(): void {
    setSearch('');
    router.push(tenantHref('/marks'));
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') {
      return items;
    }
    return items.filter((row) =>
      `${row.className} ${row.subjectName} ${row.typeName}`.toLowerCase().includes(needle),
    );
  }, [items, search]);

  const open = (row: AssessmentListItem): void => {
    router.push(tenantHref(`/marks/${row.id}`));
  };

  const columns: CardTableColumn<AssessmentListItem>[] = [
    {
      key: 'date',
      label: 'Date',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[14%]',
      headerCell: feeListTableHeader('Date'),
      render: (row) => <DateDisplay value={row.heldOn} className="text-sm" />,
    },
    {
      key: 'class',
      label: 'Class',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[14%]',
      headerCell: feeListTableHeader('Class', ClassIcon),
      render: (row) => (
        <StatusBadge tone={classBadgeTone(row.className)} size="sm" showIcon={false} className={LIST_TABLE_BADGE_CLASS}>
          {row.className}
        </StatusBadge>
      ),
    },
    {
      key: 'subject',
      label: 'Subject',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[22%]',
      headerCell: feeListTableHeader('Subject'),
      render: (row) => (
        <TwoLineCell primary={<span className="font-medium">{row.subjectName}</span>} secondary={row.typeName} />
      ),
    },
    {
      key: 'total',
      label: 'Total marks',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[12%]',
      headerCell: feeListTableHeader('Total marks'),
      render: (row) => <span className="text-sm tabular-nums">{row.totalMarks}</span>,
    },
    {
      key: 'entered',
      label: 'Students',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[12%]',
      hideOnMobile: true,
      headerCell: feeListTableHeader('Students'),
      render: (row) => <span className="text-sm tabular-nums">{row.entryCount}</span>,
    },
    {
      key: 'average',
      label: 'Class average',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[18%]',
      hideOnMobile: true,
      headerCell: feeListTableHeader('Class average'),
      render: (row) =>
        row.averagePercent === null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${String(Math.min(100, row.averagePercent))}%` }}
              />
            </div>
            <span className="text-sm tabular-nums">{row.averagePercent}%</span>
          </div>
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[8%]',
      headerCell: feeListTableHeader('Actions'),
      render: (row) => (
        <ListTableRowActions ariaLabel={`Actions for ${row.subjectName}, ${row.className}`}>
          <DropdownMenuItem
            onSelect={() => {
              afterMenuAction(() => {
                open(row);
              });
            }}
          >
            <EditIcon aria-hidden="true" />
            {can.enter ? 'View / edit marks' : 'View marks'}
          </DropdownMenuItem>
        </ListTableRowActions>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <WorkspacePageHeader
        title="Marks"
        description="Class tests, monthly tests, surprise tests and exams — entered per class and subject."
        actions={
          <>
            {can.setup ? (
              <Button asChild tone="outline">
                <Link href={tenantHref('/marks/setup')}>
                  <SettingsIcon className="size-4" aria-hidden="true" />
                  Subjects &amp; types
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <ListTableScreen
        tableTitle="All assessments"
        filters={
          <ListPageToolbar
            searchQuery={search}
            onSearchQueryChange={setSearch}
            searchPlaceholder="Class, subject or assessment type…"
            searchAriaLabel="Search assessments"
            filters={
              <>
                <SimpleSelect
                  className="w-full min-w-32 sm:w-40"
                  ariaLabel="Filter by class"
                  value={filters.classLevelId}
                  triggerIcon={ClassIcon}
                  emptyOption={{ value: '', label: 'Any class' }}
                  placeholder="Any class"
                  disabled={classes.length === 0}
                  onValueChange={(value) => {
                    apply({ classLevelId: value });
                  }}
                  options={classes.map((entry) => ({ value: entry.id, label: entry.name, icon: ClassIcon }))}
                />
                <SimpleSelect
                  className="w-full min-w-32 sm:w-40"
                  ariaLabel="Filter by subject"
                  value={filters.subjectId}
                  emptyOption={{ value: '', label: 'Any subject' }}
                  placeholder="Any subject"
                  onValueChange={(value) => {
                    apply({ subjectId: value });
                  }}
                  options={subjects.map((entry) => ({ value: entry.id, label: entry.name }))}
                />
                <SimpleSelect
                  className="w-full min-w-32 sm:w-40"
                  ariaLabel="Filter by assessment type"
                  value={filters.assessmentTypeId}
                  emptyOption={{ value: '', label: 'Any type' }}
                  placeholder="Any type"
                  onValueChange={(value) => {
                    apply({ assessmentTypeId: value });
                  }}
                  options={types.map((entry) => ({ value: entry.id, label: entry.name }))}
                />
                {can.enter ? (
                  <Button asChild className="w-full sm:w-auto">
                    <Link href={tenantHref('/marks/new')}>
                      <CreateIcon className="size-4" aria-hidden="true" />
                      New assessment
                    </Link>
                  </Button>
                ) : null}
              </>
            }
          />
        }
      >
        <ListDataTable
          title="All assessments"
          caption="Assessments"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          minWidthClass="min-w-[52rem]"
          error={error}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          onRowClick={open}
          empty={{
            title: 'No marks entered yet',
            description: can.enter
              ? 'A test or exam appears here as soon as you enter its marks. Pick a class, a subject, then type each student’s marks.'
              : 'Tests and exams appear here once a teacher enters their marks.',
            action: can.enter ? (
              <Button asChild>
                <Link href={tenantHref('/marks/new')}>
                  <CreateIcon className="size-4" aria-hidden="true" />
                  Enter the first marks
                </Link>
              </Button>
            ) : undefined,
          }}
          renderMobileRow={(row) => (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <TwoLineCell
                primary={<span className="font-medium">{row.subjectName}</span>}
                secondary={`${row.className} · ${row.typeName}`}
              />
              <span className="text-sm tabular-nums">
                {row.averagePercent === null ? '—' : `${String(row.averagePercent)}%`}
              </span>
            </div>
          )}
        />
      </ListTableScreen>
    </div>
  );
}
