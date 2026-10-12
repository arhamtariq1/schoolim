import { ProfileViewSkeleton } from '@/components/profile-skeletons';
import { WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

export default function SchoolSettingsLoading() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading school settings">
      <WorkspacePageHeaderSkeleton />
      <ProfileViewSkeleton />
    </div>
  );
}
