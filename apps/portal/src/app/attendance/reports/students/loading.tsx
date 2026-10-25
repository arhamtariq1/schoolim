import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function StudentAttendanceReportLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading attendance report"
      filterCount={2}
      showPrimaryButton={false}
      showSelectColumn={false}
      tableRows={8}
    />
  );
}
