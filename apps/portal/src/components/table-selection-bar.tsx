'use client';

import { Button, FloatingActionBar } from '@ilm/ui';
import type { ReactNode } from 'react';

export interface TableSelectionBarProps {
  readonly count: number;
  readonly noun: string;
  readonly onClear: () => void;
  readonly actions?: ReactNode;
}

/** Bottom pill bar when one or more table rows are selected. */
export function TableSelectionBar({ count, noun, onClear, actions }: TableSelectionBarProps) {
  if (count === 0) {
    return null;
  }

  const label =
    count === 1 ? `1 ${noun} selected` : `${String(count)} ${noun}s selected`;

  return (
    <FloatingActionBar
      message={<span className="font-medium">{label}</span>}
      actions={
        <>
          <Button tone="ghost" size="sm" onClick={onClear}>
            Clear selection
          </Button>
          {actions}
        </>
      }
    />
  );
}
