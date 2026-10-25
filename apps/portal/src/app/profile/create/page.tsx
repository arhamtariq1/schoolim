import { ProfileAlreadyComplete } from '@/components/profile-already-complete';
import { ProfileEditorPage } from '@/components/profile-editor-page';
import { requireSchoolSession } from '@/lib/require-session';

/**
 * First-login gate — same sections as Profile, in edit mode, until setup is done.
 */
export default async function CreateProfilePage() {
  const session = await requireSchoolSession({ allowIncompleteProfile: true });

  if (session.profileCompleted) {
    return <ProfileAlreadyComplete />;
  }

  return <ProfileEditorPage mode="setup" />;
}
