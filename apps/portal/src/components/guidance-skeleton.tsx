import { Card, Skeleton } from '@ilm/ui';

import { WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

/**
 * `/guidance` — the header, the welcome card with its picture, the contents
 * chips, and the first two area guides.
 */
export function GuidancePageSkeleton() {
  return (
    <div className="w-full space-y-8" role="status" aria-label="Loading guidance">
      <WorkspacePageHeaderSkeleton />
      <Card aria-hidden="true" className="grid gap-6 p-4 sm:p-6 md:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="aspect-video w-full rounded-xl" />
      </Card>
      <div aria-hidden="true" className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      {[0, 1].map((index) => (
        <Card key={index} aria-hidden="true" className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-32 rounded-md" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}
