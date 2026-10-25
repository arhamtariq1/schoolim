import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function StaffAttendanceReportLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading staff attendance report"
      filterCount={1}
      showPrimaryButton={false}
      showSelectColumn={false}
      tableRows={8}
    />
  );
}
