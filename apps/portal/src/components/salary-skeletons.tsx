import { cardSurfaceClassName, cn, Skeleton } from '@ilm/ui';

import { WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

function TableRowsSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div>
      <div className="flex items-center gap-4 border-y border-border bg-muted/30 px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className={cn('h-4', index === 0 ? 'w-40' : 'flex-1')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, index) =>
            index === 0 ? (
              <div key={index} className="flex w-40 items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ) : (
              <Skeleton key={index} className="h-4 flex-1" />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function TilesSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-32" />
        </div>
      ))}
    </div>
  );
}

/** `/salaries` — header, month picker, four tiles, and the table. */
export function SalariesPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading salaries">
      <WorkspacePageHeaderSkeleton />
      <TilesSkeleton />
      <section className={cn(cardSurfaceClassName, 'overflow-hidden')}>
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <Skeleton className="h-10 w-full max-w-sm rounded-md" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </div>
        <TableRowsSkeleton rows={8} columns={7} />
        <div className="flex items-center justify-between px-4 py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </section>
    </div>
  );
}

/** A person's salary: who, four tiles, the months, the payments. */
export function SalaryDetailSkeleton({ showStaffInfo = false }: { showStaffInfo?: boolean }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading salary">
      {showStaffInfo ? (
        <section className={cn(cardSurfaceClassName, 'flex items-center gap-4 p-5')}>
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="hidden h-10 w-72 sm:block" />
        </section>
      ) : null}
      <TilesSkeleton />
      <section className={cn(cardSurfaceClassName, 'overflow-hidden')}>
        <div className="space-y-1.5 border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64" />
        </div>
        <TableRowsSkeleton rows={5} columns={6} />
      </section>
      <section className={cn(cardSurfaceClassName, 'overflow-hidden')}>
        <div className="space-y-1.5 border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56" />
        </div>
        <TableRowsSkeleton rows={4} columns={6} />
      </section>
    </div>
  );
}

/** `/salaries/[id]` — the page header and the panel. */
export function SalaryDetailPageSkeleton() {
  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeaderSkeleton />
      <SalaryDetailSkeleton showStaffInfo />
    </div>
  );
}

/** A payment receipt: one small printable sheet. */
export function SalaryReceiptSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 py-8" role="status" aria-label="Loading receipt">
      <section className={cn(cardSurfaceClassName, 'space-y-4 p-6')}>
        <Skeleton className="mx-auto h-6 w-48" />
        <Skeleton className="mx-auto h-4 w-32" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex justify-between gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
        ))}
      </section>
    </div>
  );
}
