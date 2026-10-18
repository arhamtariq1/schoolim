import { ListTableScreenSkeleton, WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

export default function ParentVouchersLoading() {
  return (
    <div className="w-full space-y-6" role="status" aria-label="Loading fee vouchers">
      <WorkspacePageHeaderSkeleton />
      <ListTableScreenSkeleton
        ariaLabel="Loading fee vouchers"
        filterCount={3}
        showPrimaryButton={false}
        tableRows={6}
        showSelectColumn={false}
      />
    </div>
  );
}
