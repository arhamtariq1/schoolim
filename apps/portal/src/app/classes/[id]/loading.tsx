import { ListWorkspacePageSkeleton } from '@/components/page-skeletons';

export default function ClassesLoading() {
  return (
    <ListWorkspacePageSkeleton
      ariaLabel="Loading classes"
      filterCount={0}
      showPrimaryButton={false}
      showHeaderAction
      showSelectColumn={false}
      tableRows={6}
    />
  );
}
