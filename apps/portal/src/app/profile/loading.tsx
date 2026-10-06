import { PageHeaderSkeleton, ProfileViewSkeleton } from '@/components/profile-skeletons';

export default function ProfileLoading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withActions />
      <ProfileViewSkeleton />
    </div>
  );
}
