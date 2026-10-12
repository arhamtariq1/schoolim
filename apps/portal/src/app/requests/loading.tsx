import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function RequestsLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading requests"
      filterCount={1}
      showPrimaryButton={false}
      showSelectColumn={false}
      tableRows={6}
    />
  );
}
