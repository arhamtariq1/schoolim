import { Card, Skeleton } from '@ilm/ui';

import { ListTableScreenSkeleton, WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

/** `/requests` — header, the four summary cards, then the list. */
export function RequestsPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading requests">
      <WorkspacePageHeaderSkeleton withActions />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="size-10 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-14" />
          </Card>
        ))}
      </div>
      <ListTableScreenSkeleton
        ariaLabel="Loading requests"
        filterCount={3}
        showPrimaryButton={false}
        showHeaderAction={false}
        tableRows={8}
        showSelectColumn={false}
      />
    </div>
  );
}

/** `/requests/:id` — the request, its conversation, and the side panels. */
export function RequestDetailPageSkeleton() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading the request">
      <WorkspacePageHeaderSkeleton withActions />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </Card>
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex justify-between gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </Card>
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
