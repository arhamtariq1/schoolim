import { cardSurfaceClassName, cn, Skeleton } from '@ilm/ui';

/** Home dashboard layout while server data loads — shell stays mounted. */
export function DashboardLoading() {
  return (
    <div className="w-full space-y-3" role="status" aria-label="Loading dashboard">
      <header className="space-y-1 py-1">
        <Skeleton className="h-8 w-64 md:h-9" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </header>

      <div className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cn(cardSurfaceClassName, 'h-32 p-4')}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-8 w-24" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid w-full gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className={cn(cardSurfaceClassName, 'h-72 p-4 lg:min-h-80')}>
            <div className="mb-3 flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-[calc(100%-2rem)] w-full rounded-lg" />
          </div>
        ))}
      </div>

      <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className={cn(cardSurfaceClassName, 'h-80 p-4')}>
          <Skeleton className="mb-3 h-5 w-40" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
        <div className={cn(cardSurfaceClassName, 'h-80 p-4')}>
          <Skeleton className="mb-3 h-5 w-24" />
          <Skeleton className="mb-2 h-8 w-full" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 28 }, (_, index) => (
              <Skeleton key={index} className="aspect-square rounded-md" />
            ))}
          </div>
        </div>
      </div>

      <div className={cn(cardSurfaceClassName, 'h-56 overflow-hidden')}>
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-36" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
