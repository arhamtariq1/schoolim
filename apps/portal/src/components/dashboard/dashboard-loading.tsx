import { Skeleton } from '@ilm/ui';

/** Home dashboard layout while server data loads — shell stays mounted. */
export function DashboardLoading() {
  return (
    <div className="w-full space-y-3" role="status" aria-label="Loading dashboard">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-20 w-72 max-w-full rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-lg lg:min-h-80" />
        <Skeleton className="h-72 rounded-lg lg:min-h-80" />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-2xl lg:col-span-1" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-1" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
