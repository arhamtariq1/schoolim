import { cn, Skeleton } from '@ilm/ui';
import type { ReactNode } from 'react';

import { setupFormCardClassName } from '@/components/form-section-card';

export function PageHeaderSkeleton({ withActions = false }: { withActions?: boolean }) {
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3"
      aria-hidden="true"
    >
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-7 w-44 md:h-8 md:w-52" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {withActions ? <Skeleton className="h-9 w-32 shrink-0 rounded-md" /> : null}
    </header>
  );
}

/** Read-only `/profile` — matches `ProfileView` two-column layout. */
export function ProfileViewSkeleton() {
  return (
    <div
      className="mx-auto grid w-full max-w-3xl gap-6 lg:grid-cols-5"
      role="status"
      aria-label="Loading profile"
    >
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-3">
        <div className="flex items-start gap-4 border-b border-border bg-muted/30 px-4 py-5 sm:px-6">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-14 shrink-0 rounded-md" />
        </div>
        <div className="divide-y divide-border">
          <DetailRowSkeleton />
          <DetailRowSkeleton />
          <DetailRowSkeleton />
        </div>
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <Skeleton className="h-3 w-32" />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
        <div className="flex items-start gap-3 border-b border-border bg-muted/30 px-4 py-4 sm:px-5">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-9 w-16 shrink-0 rounded-md" />
        </div>
        <div className="divide-y divide-border">
          <DetailRowSkeleton />
          <DetailRowSkeleton />
          <DetailRowSkeleton />
          <DetailRowSkeleton />
          <DetailRowSkeleton />
        </div>
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <Skeleton className="h-3 w-36" />
        </div>
      </section>
    </div>
  );
}

/** Owner onboarding on `/profile/create` — profile + school cards and footer. */
export function ProfileSetupFormSkeleton() {
  return (
    <div className="w-full space-y-5 pb-6" role="status" aria-label="Loading setup form">
      <FormSectionSkeleton>
        <ProfilePersonFieldsSkeleton withEmail />
      </FormSectionSkeleton>

      <FormSectionSkeleton titleWidth="w-36" descriptionWidth="max-w-2xl">
        <div className="space-y-5">
          <LogoPickerSkeleton />
          <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton withHint />
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/25 p-4 sm:p-5">
            <Skeleton className="mb-4 h-4 w-20" />
            <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
              <FieldSkeleton withHint />
              <FieldSkeleton />
              <FieldSkeleton />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
            <div className="space-y-2 lg:col-span-2">
              <FieldSkeleton withHint />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </FormSectionSkeleton>

      <SetupFooterSkeleton />
    </div>
  );
}

function FormSectionSkeleton({
  titleWidth = 'w-40',
  descriptionWidth = 'max-w-3xl',
  children,
}: {
  titleWidth?: string;
  descriptionWidth?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(setupFormCardClassName, 'p-5 sm:p-6 md:p-7')} aria-hidden="true">
      <div className="mb-6 space-y-2">
        <Skeleton className={cn('h-5', titleWidth)} />
        <Skeleton className={cn('h-4 w-full', descriptionWidth)} />
      </div>
      {children}
    </section>
  );
}

function ProfilePersonFieldsSkeleton({ withEmail }: { withEmail?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <FieldSkeleton />
        {withEmail ? <FieldSkeleton withHint /> : null}
        <FieldSkeleton withHint />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        <FieldSkeleton withHint />
      </div>
    </div>
  );
}

function LogoPickerSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Skeleton className="size-16 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-3 w-56" />
      </div>
    </div>
  );
}

function FieldSkeleton({ withHint = false }: { withHint?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-full rounded-lg" />
      {withHint ? <Skeleton className="h-3 w-full max-w-xs" /> : null}
    </div>
  );
}

function DetailRowSkeleton() {
  return (
    <div className="flex justify-between gap-4 px-4 py-3 sm:px-6">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-32 max-w-[50%]" />
    </div>
  );
}

function SetupFooterSkeleton() {
  return (
    <div className="flex flex-col-reverse gap-4 px-1 pt-1 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="hidden h-4 w-64 sm:block" />
      <div className="flex justify-end gap-3">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </div>
  );
}
