import { ROUTES, type UserProfile } from '@ilm/contracts';

import { ProfilePageLayout } from '@/components/profile-page-layout';
import { ProfileWorkspaceEditor } from '@/components/profile-workspace-editor';
import { apiFetch } from '@/lib/api';
import { loadProfileSchoolWorkspace } from '@/lib/profile-school-workspace';
import { getSession } from '@/lib/session';

const PROFILE_DESCRIPTION = 'Manage your account and school information.';

export default async function ProfilePage() {
  const session = await getSession();
  const [profileResult, workspace] = await Promise.all([
    apiFetch<{ data: UserProfile }>(ROUTES.me.profile),
    loadProfileSchoolWorkspace(),
  ]);

  const roleLabel = session?.roles.join(', ') ?? '';

  return (
    <ProfilePageLayout title="Profile" description={PROFILE_DESCRIPTION}>
      {profileResult.ok ? (
        <ProfileWorkspaceEditor
          mode="view"
          profile={profileResult.data.data}
          workspace={workspace}
          roleLabel={roleLabel}
        />
      ) : (
        <p className="text-sm text-danger">{profileResult.message}</p>
      )}
    </ProfilePageLayout>
  );
}

export { ProfileViewSkeleton as ProfilePageSkeleton } from '@/components/profile-skeletons';
