'use client';

import { Card } from '@ilm/ui';
import type { ReactNode } from 'react';

export interface ListTableScreenProps {
  /** Search + filter controls (usually {@link ListPageToolbar}). Omit when there are none. */
  readonly filters?: ReactNode;
  readonly tableTitle: string;
  readonly headerActions?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

/** Fee-vouchers-style list card: filters, table caption row, embedded table, footer. */
export function ListTableScreen({
  filters,
  tableTitle,
  headerActions,
  footer,
  children,
}: ListTableScreenProps) {
  return (
    <Card className="overflow-hidden">
      {filters === undefined ? null : (
        <div className="border-b border-border p-4">{filters}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{tableTitle}</h2>
        {headerActions === undefined ? null : (
          <div className="flex items-center gap-2">{headerActions}</div>
        )}
      </div>

      {children}

      {footer === undefined ? null : footer}
    </Card>
  );
}
