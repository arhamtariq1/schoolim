import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function MarkStudentAttendanceLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading student attendance"
      filterCount={2}
      showPrimaryButton={false}
      tableRows={10}
    />
  );
}
