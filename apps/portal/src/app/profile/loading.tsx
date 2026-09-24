import { Skeleton } from '@ilm/ui';

export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 p-4 md:p-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="mt-6 h-56 w-full" />
    </div>
  );
}
