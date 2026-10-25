import type { ReactNode } from 'react';

/**
 * @deprecated Dashboard chrome is rendered once from `DashboardChrome` in the
 * root layout. Pages should return main content only.
 */
export function SchoolShell({ children }: { children: ReactNode }) {
  return children;
}
