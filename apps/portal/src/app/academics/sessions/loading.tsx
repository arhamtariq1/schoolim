import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function SessionsLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading academic sessions"
      filterCount={0}
      showPrimaryButton={false}
      showHeaderAction
      showSelectColumn={false}
      tableRows={5}
    />
  );
}
