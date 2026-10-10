import { Skeleton } from '@ilm/ui';

/** Students list shell while the server fetch runs. */
export default function StudentsLoading() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading students">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}
