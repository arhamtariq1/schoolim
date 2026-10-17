import type { ReactNode } from 'react';

import { FeeSettingsShell } from '@/components/fee-settings-shell';
import { getSession } from '@/lib/session';

/**
 * Wraps every Fee Settings page (All Fees, Late Fee, Voucher Settings, GR
 * Number, Other). A layout stays mounted while its pages change, so the
 * secondary navigation is never re-rendered, reloaded or replaced by a
 * skeleton: only `children` — the page, or its `loading.tsx` — swaps.
 */
export default async function FeeSettingsLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return <FeeSettingsShell permissions={session?.permissions ?? []}>{children}</FeeSettingsShell>;
}
