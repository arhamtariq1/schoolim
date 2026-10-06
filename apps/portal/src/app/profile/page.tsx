import { ROUTES, type UserProfile } from '@ilm/contracts';
import { Button } from '@ilm/ui';
import { EditIcon, ICON_SIZE } from '@ilm/ui/icons';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { ProfileView } from '@/components/profile-view';
import { apiFetch } from '@/lib/api';

/**
 * Read-only profile. Incomplete sessions never land here — the proxy and
 * `requireSchoolSession` send them to `/profile/create`.
 */
export default async function ProfilePage() {
  const result = await apiFetch<{ data: UserProfile }>(ROUTES.me.profile);

  return (
    <div className="space-y-6">
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
    </div>
  );
}

export { ProfileViewSkeleton as ProfilePageSkeleton } from '@/components/profile-skeletons';
