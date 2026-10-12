import { ProfilePageLayout } from '@/components/profile-page-layout';
import { ProfileSetupFormSkeleton } from '@/components/profile-skeletons';

export default function ProfileEditLoading() {
  return (
    <ProfilePageLayout title="Edit profile" description="Update your personal and school details.">
      <ProfileSetupFormSkeleton />
    </ProfilePageLayout>
  );
}
