import { Card, Skeleton } from '@ilm/ui';

import { ListTableScreenSkeleton, WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

export default function PromoteStudentsLoading() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading promote students">
      <WorkspacePageHeaderSkeleton />
      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </Card>
      <ListTableScreenSkeleton
        ariaLabel="Loading students to promote"
        filterCount={0}
        showPrimaryButton={false}
        showSelectColumn={false}
        tableRows={6}
      />
    </div>
  );
}
