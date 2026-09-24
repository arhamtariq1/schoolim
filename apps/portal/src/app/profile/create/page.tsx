import { ROUTES, type UserProfile } from '@ilm/contracts';

import { OnboardingForm } from '@/components/onboarding-form';
import { PageHeader } from '@/components/page-header';
import { ProfileAlreadyComplete } from '@/components/profile-already-complete';
import { ProfileForm } from '@/components/profile-form';
import { SchoolShell } from '@/components/school-shell';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';

/**
 * First-login gate — school + owner setup, or personal profile for invited staff.
 *
 * `allowIncompleteProfile` stops this page redirecting to itself. Completing
 * the form unlocks the rest of the portal.
 */
export default async function CreateProfilePage() {
  const session = await requireSchoolSession({ allowIncompleteProfile: true });

  if (session.profileCompleted) {
    return (
      <SchoolShell allowIncompleteProfile>
        <ProfileAlreadyComplete />
      </SchoolShell>
    );
  }

  const result = await apiFetch<{ data: UserProfile }>(ROUTES.me.profile);
  const needsSchoolSetup = result.ok && !result.data.data.school.onboarded;

  return (
    <SchoolShell allowIncompleteProfile>
      <PageHeader
        title={needsSchoolSetup ? 'Set up your school' : 'Create your profile'}
        description={
          needsSchoolSetup
            ? 'Tell us about your school and yourself. Then the rest of the portal opens.'
            : 'One quick step before you open the rest of the school portal.'
        }
      />
      {!result.ok ? (
        <p className="text-sm text-danger">{result.message}</p>
      ) : needsSchoolSetup ? (
        <OnboardingForm initial={result.data.data} />
      ) : (
        <ProfileForm mode="create" initial={result.data.data} />
      )}
    </SchoolShell>
  );
}
