import type { ReactNode } from 'react';

import { FeeSettingsNav } from '@/components/fee-settings-nav';

/**
 * Page chrome for every Fee Settings screen: the secondary navigation beside
 * the content, inside the main layout (the main sidebar stays where it is).
 *
 * From `lg` the page padding of the workspace is cancelled with negative
 * margins so the navigation runs flush from under the header to the bottom of
 * the viewport, and the content gets that padding back on its own.
 */
export function FeeSettingsShell({
  permissions,
  children,
}: {
  readonly permissions: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-6 lg:-mt-4 lg:-mb-5 lg:-ms-4 lg:-me-4 lg:flex-row lg:items-start lg:gap-0">
      <FeeSettingsNav permissions={permissions} />
      <div className="min-w-0 flex-1 space-y-8 lg:py-4 lg:ps-6 lg:pe-4">{children}</div>
    </div>
  );
}
