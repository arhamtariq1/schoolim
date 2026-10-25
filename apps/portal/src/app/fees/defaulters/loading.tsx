import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function DefaultersLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading defaulters"
      filterCount={2}
      showPrimaryButton={false}
      showHeaderAction
      tableRows={8}
    />
  );
}
