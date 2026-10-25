import { Card, Skeleton } from '@ilm/ui';

/**
 * `/parent` — the same rows as the page: heading, a card for each child, the
 * profile strip, three cards, the weekly timetable and the vouchers with the
 * results beside them. Same grids, same gaps, same card padding, so nothing moves
 * when the real thing arrives.
 */
export default function ParentLoading() {
  return (
    <div className="parent-portal w-full space-y-4" role="status" aria-label="Loading your children">
      <header className="space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-44 md:h-9" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index} className="flex items-center gap-3 p-4">
            <Skeleton className="size-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-14 rounded-full" />
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-5 p-5 sm:p-6" aria-hidden="true">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-4 lg:justify-center">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-5" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-14 w-44 rounded-xl" />
      </Card>

      <div className="grid gap-3 lg:grid-cols-3" aria-hidden="true">
        <Card className="flex flex-col gap-4 p-5">
          <Skeleton className="h-5 w-44" />
          <div className="flex items-center gap-6">
            <Skeleton className="size-32 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-lg" />
          ))}
        </Card>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 p-5" aria-hidden="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-8" />
          ))}
          {Array.from({ length: 21 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-lg" />
          ))}
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 2 }, (_, card) => (
          <Card key={card} className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 4 }, (_, row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
