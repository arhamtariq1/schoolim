import { ROUTES, type UserProfile } from '@ilm/contracts';
import { Button } from '@ilm/ui';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { ProfileForm } from '@/components/profile-form';
import { SchoolShell } from '@/components/school-shell';
import { apiFetch } from '@/lib/api';

export default async function EditProfilePage() {
  const result = await apiFetch<{ data: UserProfile }>(ROUTES.me.profile);

  return (
    <SchoolShell>
      <PageHeader
        title="Edit profile"
        description="Update your name, phone or designation."
        actions={
          <Button asChild tone="ghost">
            <Link href="/profile" className="cursor-pointer">
              Cancel
            </Link>
          </Button>
        }
      />
      {result.ok ? (
        <ProfileForm mode="edit" initial={result.data.data} />
      ) : (
        <p className="text-sm text-danger">{result.message}</p>
      )}
    </SchoolShell>
  );
}
