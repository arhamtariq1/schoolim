import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function StaffLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading staff"
      filterCount={2}
      showPrimaryButton
      tableRows={8}
    />
  );
}
