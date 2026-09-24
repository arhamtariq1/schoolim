import { ROUTES, type UserProfile } from '@ilm/contracts';
import { Button, Skeleton } from '@ilm/ui';
import { EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { ProfileView } from '@/components/profile-view';
import { SchoolShell } from '@/components/school-shell';
import { apiFetch } from '@/lib/api';

/**
 * Read-only profile. Incomplete sessions never land here — the proxy and
 * `requireSchoolSession` send them to `/profile/create`.
 */
export default async function ProfilePage() {
  const result = await apiFetch<{ data: UserProfile }>(ROUTES.me.profile);

  return (
    <SchoolShell>
      <PageHeader
        title="Profile"
        description="Your account details at this school."
        actions={
          <Button asChild>
            <Link href="/profile/edit" className="cursor-pointer">
              <EditIcon className={ICON_SIZE.inline} aria-hidden="true" />
              Edit profile
            </Link>
          </Button>
        }
      />
      {result.ok ? (
        <ProfileView profile={result.data.data} />
      ) : (
        <p className="text-sm text-danger">{result.message}</p>
      )}
    </SchoolShell>
  );
}

export function ProfilePageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4" role="status" aria-label="Loading profile">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
