import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ConsoleShell } from '@/components/console-shell';
import { getPlatformSession } from '@/lib/api';

/**
 * Everything behind sign-in shares one frame and one session check.
 *
 * Checked here once rather than per page, so a page added later is behind the
 * login by default. Each page still reads the capabilities it needs: this
 * decides who is in, the page decides what they may see.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await getPlatformSession();
  if (session === undefined) {
    redirect('/login');
  }

  return <ConsoleShell session={session}>{children}</ConsoleShell>;
}
