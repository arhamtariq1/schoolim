import { ROUTES, type UserProfile } from '@ilm/contracts';

import { PageHeader } from '@/components/page-header';
import { ProfileForm } from '@/components/profile-form';
import { apiFetch } from '@/lib/api';

export default async function EditProfilePage() {
  const result = await apiFetch<{ data: UserProfile }>(ROUTES.me.profile);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit profile"
        description="Update your account and personal details as they appear in the portal."
      />
      {result.ok ? (
        <ProfileForm mode="edit" initial={result.data.data} />
      ) : (
        <p className="text-sm text-danger">{result.message}</p>
      )}
    </div>
  );
}
