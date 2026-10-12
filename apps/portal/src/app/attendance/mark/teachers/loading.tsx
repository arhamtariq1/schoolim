import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function MarkStaffAttendanceLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading staff attendance"
      filterCount={1}
      showPrimaryButton={false}
      tableRows={10}
    />
  );
}
