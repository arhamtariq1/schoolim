import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function SecurityDepositsLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading security deposits"
      filterCount={2}
      showPrimaryButton={false}
      showHeaderAction
      tableRows={8}
    />
  );
}
