import { Card, Skeleton } from '@ilm/ui';

import { WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

/**
 * `/pricing` and `/billing` — the header, then the "not built yet" empty state
 * the page shows: an icon, a title and a line of explanation inside a bordered
 * block.
 */
export function EmptyStatePageSkeleton({ ariaLabel }: { readonly ariaLabel: string }) {
  return (
    <div className="w-full space-y-6" role="status" aria-label={ariaLabel}>
      <WorkspacePageHeaderSkeleton />
      <div
        aria-hidden="true"
        className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border px-6 py-12 text-center"
      >
        <Skeleton className="size-10 rounded-md" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
    </div>
  );
}

/**
 * `/marks/new` and `/marks/:id` — the entry form: a header, a card of the
 * selectors (class, subject, kind of test, date, total), and the roster of
 * students with a box for each mark.
 */
export function MarksEntryPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading the marks form">
      <WorkspacePageHeaderSkeleton />
      <Card className="space-y-4 p-4 sm:p-6" aria-hidden="true">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden" aria-hidden="true">
        <Skeleton className="h-11 w-full rounded-none" />
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-10 w-24" />
          </div>
        ))}
      </Card>
    </div>
  );
}

/**
 * `/attendance/mark/students/:classLevelId` — the roster: a header, a strip with
 * the date and the day's counts, and a row for each child with their four
 * status buttons.
 */
export function AttendanceRosterPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading the class roster">
      <WorkspacePageHeaderSkeleton withActions />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden" aria-hidden="true">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 4 }, (_, button) => (
                <Skeleton key={button} className="size-9 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/** `/fees/vouchers/print` — the print view's toolbar, and the first sheet beneath it. */
export function ChallanPrintPageSkeleton() {
  return (
    <div className="bg-background" role="status" aria-label="Loading challans">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card p-4" aria-hidden="true">
        <Skeleton className="h-5 w-48" />
        <span className="ms-auto flex gap-3">
          <Skeleton className="h-10 w-36 rounded-md" />
          <Skeleton className="h-10 w-24 rounded-md" />
        </span>
      </div>
      <div className="p-4" aria-hidden="true">
        <Skeleton className="h-[60vh] w-full" />
      </div>
    </div>
  );
}
