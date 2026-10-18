import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function StudentAttendanceReportClassLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading the class attendance report"
      filterCount={2}
      showPrimaryButton={false}
      showSelectColumn={false}
      tableRows={10}
    />
  );
}
