import { Skeleton } from '@ilm/ui';

/** Students list shape while the server fetch runs — shell stays mounted in the root layout. */
export default function StudentsLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading students">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
