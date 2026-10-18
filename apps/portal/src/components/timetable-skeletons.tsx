import { Card, Skeleton } from '@ilm/ui';

import { ListTableScreenSkeleton, WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

/** `/timetables` — header, then the list. */
export function TimetablesPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading timetables">
      <WorkspacePageHeaderSkeleton />
      <ListTableScreenSkeleton
        ariaLabel="Loading timetables"
        filterCount={4}
        showPrimaryButton={false}
        showHeaderAction
        tableRows={8}
        showSelectColumn={false}
      />
    </div>
  );
}

/**
 * `/timetables/:id` — the page's own shape: a title with its badge and two
 * actions, the bordered week grid beside a column of three cards (information,
 * who teaches what, actions).
 */
export function TimetableDetailPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading the timetable">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3" aria-hidden="true">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-56 md:h-9" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-hidden="true">
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-9 w-48 rounded-lg" />
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-6 gap-px bg-border">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 rounded-none" />
              ))}
              {Array.from({ length: 24 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-none" />
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex justify-between gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </Card>
          <Card className="space-y-3 p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex justify-between gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </Card>
          <Card className="space-y-2 p-5">
            <Skeleton className="h-5 w-20" />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full rounded-md" />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * `/timetables/new` and `/timetables/:id/edit` — the form's own shape: a header
 * with Back, one card of fields, rows of periods, and the buttons under it.
 */
export function TimetableFormPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading the timetable form">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3" aria-hidden="true">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 md:h-9" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </header>

      <Card className="space-y-5 p-4 sm:p-6" aria-hidden="true">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, field) => (
                <Skeleton key={field} className="h-10 w-full" />
              ))}
            </div>
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </Card>

      <div className="flex justify-end gap-2" aria-hidden="true">
        <Skeleton className="h-10 w-20 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </div>
  );
}
