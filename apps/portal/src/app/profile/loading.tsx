import { ProfilePageLayout } from '@/components/profile-page-layout';
import { ProfileViewSkeleton } from '@/components/profile-skeletons';

export default function ProfileLoading() {
  return (
    <ProfilePageLayout
      title="Profile"
      description="Manage your account and school information."
    >
      <ProfileViewSkeleton />
    </ProfilePageLayout>
  );
}
