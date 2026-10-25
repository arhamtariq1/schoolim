import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function ExpenseTypesLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading expense types"
      filterCount={0}
      showPrimaryButton={false}
      showHeaderAction
      showSelectColumn={false}
      tableRows={6}
    />
  );
}
