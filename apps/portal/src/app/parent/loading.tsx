import { Card, Skeleton } from '@ilm/ui';

export default function ParentLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading your children">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-12 w-full max-w-md" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-64 p-6 lg:col-span-1">
          <Skeleton className="size-full" />
        </Card>
        <Card className="h-64 p-6 lg:col-span-2">
          <Skeleton className="size-full" />
        </Card>
      </div>
    </div>
  );
}
