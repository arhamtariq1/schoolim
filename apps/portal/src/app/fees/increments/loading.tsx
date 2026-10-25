import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function FeeIncrementsLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading fee increment"
      filterCount={3}
      showPrimaryButton={false}
      tableRows={8}
    />
  );
}
