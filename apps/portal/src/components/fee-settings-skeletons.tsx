import { cardSurfaceClassName, cn, Skeleton } from '@ilm/ui';

import { WorkspacePageHeaderSkeleton } from '@/components/page-skeletons';

/**
 * Loading shapes for the Fee Settings pages. They fill only the content area:
 * the secondary navigation lives in the layout and is never replaced.
 */

function CardHeaderSkeleton({ withBadge = false }: { withBadge?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/70 px-5 py-4 sm:px-6">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      {withBadge ? <Skeleton className="h-6 w-20 shrink-0 rounded-full" /> : null}
    </div>
  );
}

function FieldSkeleton({ labelWidth = 'w-28' }: { labelWidth?: string }) {
  return (
    <div className="space-y-2">
      <Skeleton className={cn('h-4', labelWidth)} />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

/** Settings › Fee Settings › All Fees — add-fee form + catalogue table. */
export function AllFeesSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading fees">
      <WorkspacePageHeaderSkeleton />

      <section className={cn(cardSurfaceClassName)}>
        <CardHeaderSkeleton />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          <FieldSkeleton labelWidth="w-20" />
          <FieldSkeleton labelWidth="w-24" />
          <FieldSkeleton labelWidth="w-28" />
          <FieldSkeleton labelWidth="w-24" />
        </div>
        <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
      </section>

      <section className={cn(cardSurfaceClassName, 'overflow-hidden')}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        <div className="flex items-center gap-4 border-y border-border bg-muted/30 px-5 py-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        {Array.from({ length: 5 }, (_, row) => (
          <div key={row} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-5 w-1.5 rounded" />
          </div>
        ))}
      </section>
    </div>
  );
}

/** Settings › Fee Settings › Late Fee — one policy card. */
export function LateFeeSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading late fee settings">
      <WorkspacePageHeaderSkeleton />
      <section className={cn(cardSurfaceClassName)}>
        <CardHeaderSkeleton />
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="grid gap-4 md:grid-cols-3">
            <FieldSkeleton labelWidth="w-24" />
            <FieldSkeleton labelWidth="w-20" />
            <FieldSkeleton labelWidth="w-32" />
          </div>
          <FieldSkeleton labelWidth="w-36" />
          <div className="flex justify-end">
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>
    </div>
  );
}

/** Settings › Voucher Settings and GR Number — a numbering card (and, for vouchers, the layout). */
export function NumberSettingsCardSkeleton() {
  return (
    <section className={cn(cardSurfaceClassName)}>
      <CardHeaderSkeleton withBadge />
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <Skeleton className="h-12 w-full rounded-md" />
        <FieldSkeleton labelWidth="w-32" />
      </div>
      <div className="flex justify-end border-t border-border/70 px-5 py-4 sm:px-6">
        <Skeleton className="h-10 w-24 rounded-md" />
      </div>
    </section>
  );
}

export function GrNumberSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading GR number settings">
      <WorkspacePageHeaderSkeleton />
      <NumberSettingsCardSkeleton />
    </div>
  );
}

export function VoucherSettingsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading voucher settings">
      <WorkspacePageHeaderSkeleton />
      {/* The form's own layout: a column of setting cards beside the preview. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          {['h-12', 'h-28', 'h-16', 'h-24', 'h-20', 'h-16'].map((body, index) => (
            <section key={index} className={cn(cardSurfaceClassName, 'space-y-3 p-4')}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className={cn(body, 'w-full rounded-lg')} />
            </section>
          ))}
        </div>
        <section className={cn(cardSurfaceClassName, 'space-y-4 p-5')}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </section>
      </div>
    </div>
  );
}

/** Settings › Fee Settings › Other — a pair of link cards. */
export function OtherFeeSettingsSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading other fee settings">
      <WorkspacePageHeaderSkeleton />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className={cn(cardSurfaceClassName, 'flex items-start gap-4 p-5')}>
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
