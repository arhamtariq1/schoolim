import { PageHeaderSkeleton, ProfileSetupFormSkeleton } from '@/components/profile-skeletons';

export default function CreateProfileLoading() {
  return (
    <div className="min-h-full space-y-5 bg-slate-50 p-2 sm:p-3">
      <PageHeaderSkeleton />
      <ProfileSetupFormSkeleton />
    </div>
  );
}
