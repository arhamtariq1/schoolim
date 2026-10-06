import { ROUTES, type UserProfile } from '@ilm/contracts';

import { OnboardingForm } from '@/components/onboarding-form';
import { ProfilePageLayout } from '@/components/profile-page-layout';
import { ProfileSchoolBranding } from '@/components/profile-school-branding';
import { ProfileWorkspaceEditor } from '@/components/profile-workspace-editor';
import { apiFetch } from '@/lib/api';
import { loadProfileSchoolWorkspace } from '@/lib/profile-school-workspace';
import { getSession } from '@/lib/session';

const PROFILE_DESCRIPTION = 'Manage your account and school information.';

export async function ProfileEditorPage({ mode }: { mode: 'setup' | 'edit' }) {
  const session = await getSession();
  const [profileResult, workspace] = await Promise.all([
    apiFetch<{ data: UserProfile }>(ROUTES.me.profile),
    loadProfileSchoolWorkspace(),
  ]);

  if (!profileResult.ok) {
    return <p className="text-sm text-danger">{profileResult.message}</p>;
  }

  const profile = profileResult.data.data;
  const needsSchoolSetup = mode === 'setup' && !profile.school.onboarded;
  const roleLabel = session?.roles.join(', ') ?? '';

  return (
    <ProfilePageLayout
      title={needsSchoolSetup ? 'Complete setup' : 'Profile'}
      description={
        needsSchoolSetup
          ? 'Add your account and school details as they appear in your workspace.'
          : PROFILE_DESCRIPTION
      }
    >
      {needsSchoolSetup ? (
        <OnboardingForm initial={profile} />
      ) : (
        <ProfileWorkspaceEditor
          mode={mode === 'setup' ? 'create' : 'edit'}
          profile={profile}
          workspace={workspace}
          roleLabel={roleLabel}
        >
          {mode === 'edit' ? <ProfileSchoolBranding workspace={workspace} /> : null}
        </ProfileWorkspaceEditor>
      )}
    </ProfilePageLayout>
  );
}
