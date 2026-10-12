import { Card, cardSurfaceClassName, cn, Skeleton } from '@ilm/ui';
import type { ReactNode } from 'react';

import { setupFormCardClassName } from '@/components/form-section-card';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { pageIntro } from '@/lib/page-copy';

export function WorkspacePageHeaderSkeleton({ withActions = false }: { withActions?: boolean }) {
  return (
    <header className="space-y-4" aria-hidden="true">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-44 md:h-9 md:w-56" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </div>
        {withActions ? <Skeleton className="h-9 w-32 shrink-0 rounded-md" /> : null}
      </div>
    </header>
  );
}

export type ListTableScreenSkeletonProps = {
  readonly ariaLabel?: string;
  /** Filter controls beside search (selects, etc.). */
  readonly filterCount?: number;
  readonly showPrimaryButton?: boolean;
  readonly showHeaderAction?: boolean;
  readonly tableRows?: number;
  readonly showSelectColumn?: boolean;
  /** When set, renders the real table caption row label (e.g. “All students”). */
  readonly tableTitleText?: string;
  readonly tableMinWidthClass?: string;
  readonly tableLayout?: 'default' | 'students';
};

function ListTableToolbarSkeleton({
  filterCount,
  showPrimaryButton,
}: {
  filterCount: number;
  showPrimaryButton: boolean;
}) {
  return (
    <div className="border-b border-border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-10 w-full md:max-w-md lg:max-w-xl" />
        <div className="flex flex-wrap items-center gap-2 md:ms-auto md:justify-end">
          {Array.from({ length: filterCount }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full min-w-32 sm:w-36" />
          ))}
          {showPrimaryButton ? <Skeleton className="h-10 w-full sm:w-40" /> : null}
        </div>
      </div>
    </div>
  );
}

function ListTableCaptionRowSkeleton({
  tableTitleText,
  showHeaderAction,
}: {
  tableTitleText?: string;
  showHeaderAction: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
      {tableTitleText === undefined ? (
        <Skeleton className="h-4 w-28" />
      ) : (
        <h2 className="text-sm font-semibold text-foreground">{tableTitleText}</h2>
      )}
      {showHeaderAction ? <Skeleton className="h-8 w-24 rounded-md" /> : null}
    </div>
  );
}

function ListTablePaginationSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-4 w-52 max-w-full" />
      <Skeleton className="h-10 w-full sm:w-36" />
    </div>
  );
}

function SkeletonTableCell({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-3 py-2.5 align-middle">{children}</td>;
}

function StudentsRegisterTableSkeleton({ tableRows }: { tableRows: number }) {
  return (
    <>
    <ul className="divide-y divide-border md:hidden" aria-hidden="true">
      {Array.from({ length: Math.min(tableRows, 6) }, (_, row) => (
        <li key={row} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-full max-w-xs" />
          </div>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[64rem] table-auto border-collapse text-sm">
        <caption className="sr-only">Students</caption>
        <colgroup>
          <col className="w-[2.75rem]" />
          <col style={{ width: '6.5rem' }} />
          <col className="w-[18%]" />
          <col className="w-[10%]" />
          <col className="w-[14%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[11%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-primary/[0.04]">
            {Array.from({ length: 10 }, (_, index) => (
              <th key={index} scope="col" className="whitespace-nowrap px-3 py-2.5">
                <Skeleton className="h-3 w-full max-w-[4.5rem]" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: tableRows }, (_, row) => (
            <tr key={row} className="border-b border-border">
              <SkeletonTableCell>
                <Skeleton className="size-4 rounded-sm" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="h-4 w-10" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <div className="flex items-center gap-2">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="h-6 w-16 rounded-md" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="h-4 w-24" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="h-4 w-20" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="h-6 w-14 rounded-md" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="h-4 w-12" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="h-4 w-20" />
              </SkeletonTableCell>
              <SkeletonTableCell>
                <Skeleton className="mx-auto size-8 max-w-8 rounded-md" />
              </SkeletonTableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function DefaultListTableSkeleton({
  tableRows,
  showSelectColumn,
  tableMinWidthClass,
}: {
  tableRows: number;
  showSelectColumn: boolean;
  tableMinWidthClass: string;
}) {
  const columnCount = showSelectColumn ? 8 : 7;

  return (
    <div className="hidden overflow-x-auto md:block">
      <table
        className={cn(
          'w-full table-fixed border-collapse text-sm',
          tableMinWidthClass,
        )}
      >
        <thead>
          <tr className="border-b border-border bg-primary/[0.04]">
            {Array.from({ length: columnCount }, (_, index) => (
              <th key={index} scope="col" className="whitespace-nowrap px-4 py-3">
                <Skeleton className="h-3 w-full max-w-[5rem]" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: tableRows }, (_, row) => (
            <tr key={row} className="border-b border-border">
              {Array.from({ length: columnCount }, (_, col) => (
                <td key={col} className="px-4 py-3 align-middle">
                  {col === (showSelectColumn ? 1 : 0) ? (
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-8 shrink-0 rounded-full" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  ) : (
                    <Skeleton className="h-4 w-full max-w-[6rem]" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mirrors {@link ListTableScreen}: toolbar, caption row, table, pagination. */
export function ListTableScreenSkeleton({
  ariaLabel = 'Loading list',
  filterCount = 2,
  showPrimaryButton = true,
  showHeaderAction = false,
  tableRows = 8,
  showSelectColumn = true,
  tableTitleText,
  tableMinWidthClass = 'min-w-[56rem]',
  tableLayout = 'default',
}: ListTableScreenSkeletonProps) {
  return (
    <Card className="overflow-hidden" role="status" aria-label={ariaLabel}>
      <ListTableToolbarSkeleton filterCount={filterCount} showPrimaryButton={showPrimaryButton} />
      <ListTableCaptionRowSkeleton
        tableTitleText={tableTitleText}
        showHeaderAction={showHeaderAction}
      />
      {tableLayout === 'students' ? (
        <StudentsRegisterTableSkeleton tableRows={tableRows} />
      ) : (
        <DefaultListTableSkeleton
          tableRows={tableRows}
          showSelectColumn={showSelectColumn}
          tableMinWidthClass={tableMinWidthClass}
        />
      )}
      <ListTablePaginationSkeleton />
    </Card>
  );
}

/** `/students` — real page chrome; only data rows pulse. */
export function StudentsPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading students">
      <WorkspacePageHeader title="Students" description={pageIntro('/students')} />
      <ListTableScreenSkeleton
        ariaLabel="Loading students"
        filterCount={2}
        showPrimaryButton
        tableRows={8}
        tableTitleText="All students"
        tableLayout="students"
      />
    </div>
  );
}

export function ListWorkspacePageSkeleton({
  filterCount = 2,
  showPrimaryButton = true,
  showHeaderAction = false,
  tableRows = 8,
  showSelectColumn = true,
  ariaLabel = 'Loading',
}: ListTableScreenSkeletonProps) {
  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeaderSkeleton />
      <ListTableScreenSkeleton
        ariaLabel={ariaLabel}
        filterCount={filterCount}
        showPrimaryButton={showPrimaryButton}
        showHeaderAction={showHeaderAction}
        tableRows={tableRows}
        showSelectColumn={showSelectColumn}
      />
    </div>
  );
}

/** `/students/new` — header plus four admission section cards. */
export function AdmissionFormPageSkeleton() {
  return (
    <div className="w-full space-y-8" role="status" aria-label="Loading admission form">
      <WorkspacePageHeaderSkeleton />
      <div className="space-y-8">
        <AdmissionSectionCardSkeleton fieldRows={2} fieldCols={3} />
        <AdmissionSectionCardSkeleton fieldRows={2} fieldCols={2} />
        <AdmissionSectionCardSkeleton fieldRows={3} fieldCols={3} tall />
        <AdmissionSectionCardSkeleton fieldRows={1} fieldCols={1} />
      </div>
      <div className="flex justify-end gap-3">
        <Skeleton className="h-10 w-28 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </div>
  );
}

function AdmissionSectionCardSkeleton({
  fieldRows,
  fieldCols,
  tall = false,
}: {
  fieldRows: number;
  fieldCols: 1 | 2 | 3;
  tall?: boolean;
}) {
  const gridClass =
    fieldCols === 1 ? 'grid-cols-1' : fieldCols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3';

  return (
    <section className={cn(cardSurfaceClassName, 'overflow-hidden')} aria-hidden="true">
      <div className="flex gap-4 border-b border-border px-6 py-5">
        <Skeleton className="size-11 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
      </div>
      <div className={cn('grid gap-5 px-6 py-6', gridClass)}>
        {Array.from({ length: fieldRows * fieldCols }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className={cn('h-10 w-full rounded-lg', tall && index === 0 && 'h-24')} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Student / staff profile hero + tabs + two-column cards. */
export function EntityProfilePageSkeleton({ ariaLabel = 'Loading profile' }: { ariaLabel?: string }) {
  return (
    <div className="w-full space-y-6" role="status" aria-label={ariaLabel}>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex min-w-0 flex-1 gap-4">
            <Skeleton className="size-16 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-8 w-56 md:h-9" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full max-w-xl" />
              <Skeleton className="h-4 w-full max-w-lg" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </Card>

      <div className="flex gap-2 overflow-x-auto">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 shrink-0 rounded-md" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Skeleton className="mb-4 h-5 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex justify-between gap-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Skeleton className="mb-4 h-5 w-28" />
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** `/finance/expenses` — stats, tabs, list, sidebar. */
export function ExpensesPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading expenses">
      <WorkspacePageHeaderSkeleton />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="size-10 rounded-lg" />
                </div>
                <Skeleton className="mt-3 h-8 w-28" />
                <Skeleton className="mt-2 h-3 w-32" />
              </Card>
            ))}
          </div>

          <div className="flex gap-2 border-b border-border pb-1">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>

          <ListTableScreenSkeleton
            ariaLabel="Loading expenses table"
            filterCount={3}
            showPrimaryButton={false}
            showHeaderAction
            tableRows={6}
          />
        </div>

        <aside className="space-y-4">
          {Array.from({ length: 2 }, (_, index) => (
            <Card key={index} className="space-y-3 p-4">
              <Skeleton className="h-4 w-32" />
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="flex justify-between gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </Card>
          ))}
        </aside>
      </div>
    </div>
  );
}

/** `/fees/vouchers` — extra filters in the toolbar. */
export function VouchersPageSkeleton() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading vouchers"
      filterCount={4}
      showPrimaryButton={false}
      showHeaderAction
      tableRows={8}
    />
  );
}

/** `/fees/generate` — form column + preview column. */
export function GenerateFeePageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading generate fee">
      <WorkspacePageHeaderSkeleton />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          <div className="flex gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-10 flex-1 rounded-lg" />
            ))}
          </div>
          {Array.from({ length: 3 }, (_, index) => (
            <section key={index} className={cn(cardSurfaceClassName, 'space-y-4 p-4 sm:p-5')}>
              <Skeleton className="h-5 w-40" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </section>
          ))}
        </div>
        <Card className="p-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </Card>
      </div>
    </div>
  );
}

/** Settings index — title + link rows. */
export function SettingsIndexSkeleton() {
  return (
    <div className="max-w-2xl space-y-6" role="status" aria-label="Loading settings">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <ul className="space-y-3">
        {Array.from({ length: 2 }, (_, index) => (
          <li key={index}>
            <Skeleton className="h-[4.5rem] w-full rounded-xl" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Settings › Fees — catalogue table + late-fee card. */
export function FeeSettingsPageSkeleton() {
  return (
    <div className="w-full space-y-8" role="status" aria-label="Loading fee settings">
      <WorkspacePageHeaderSkeleton />
      <ListTableScreenSkeleton
        ariaLabel="Loading fee heads"
        filterCount={0}
        showPrimaryButton={false}
        showHeaderAction
        showSelectColumn={false}
        tableRows={6}
      />
      <section className={cn(cardSurfaceClassName, 'space-y-4 p-4')}>
        <Skeleton className="h-5 w-36" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </section>
    </div>
  );
}

/** Academic calendar — month grid + side panel. */
export function AcademicCalendarPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading calendar">
      <WorkspacePageHeaderSkeleton withActions />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden p-4">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-8 w-40" />
            <div className="flex gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, index) => (
              <Skeleton key={index} className="aspect-square w-full rounded-md" />
            ))}
          </div>
        </Card>
        <Card className="space-y-3 p-4">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-lg" />
          ))}
        </Card>
      </div>
    </div>
  );
}

/** Simple settings / form page in a single card. */
export function SettingsFormPageSkeleton() {
  return (
    <div className="max-w-2xl space-y-6" role="status" aria-label="Loading settings">
      <WorkspacePageHeaderSkeleton />
      <section className={cn(setupFormCardClassName, 'space-y-4 p-6')}>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 rounded-md" />
      </section>
    </div>
  );
}
