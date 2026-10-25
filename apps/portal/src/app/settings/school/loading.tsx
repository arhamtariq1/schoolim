import { WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';
import { ProfileViewSkeleton } from '@/components/profile-skeletons';

export default function SchoolSettingsLoading() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading school settings">
      <WorkspacePageHeaderSkeleton />
      <ProfileViewSkeleton />
    </div>
  );
}
