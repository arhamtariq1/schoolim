'use client';

import { Checkbox, type CardTableColumn } from '@ilm/ui';
import { useCallback, useMemo, useState } from 'react';

import {
  FEE_LIST_SELECT_COLUMN,
  feeListSelectCheckboxWrap,
} from '@/components/fees/fee-list-shared';

export function useRowSelection<T>(rows: readonly T[], getRowId: (row: T) => string) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const pageIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);

  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected =
    pageIds.some((id) => selected.has(id)) && !allOnPageSelected;

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const toggleAllOnPage = useCallback(
    (checked: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of pageIds) {
          if (checked) {
            next.add(id);
          } else {
            next.delete(id);
          }
        }
        return next;
      });
    },
    [pageIds],
  );

  const toggleRowSelected = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  return {
    selected,
    setSelected,
    clearSelection,
    allOnPageSelected,
    someOnPageSelected,
    toggleAllOnPage,
    toggleRowSelected,
  };
}

export function listTableSelectColumn<T>(options: {
  readonly selected: ReadonlySet<string>;
  readonly allOnPageSelected: boolean;
  readonly someOnPageSelected: boolean;
  readonly toggleAllOnPage: (checked: boolean) => void;
  readonly toggleRowSelected: (id: string, checked: boolean) => void;
  readonly getRowId: (row: T) => string;
  readonly rowAriaLabel: (row: T) => string;
  readonly selectAllAriaLabel?: string;
}): CardTableColumn<T> {
  return {
    key: 'select',
    label: '',
    ...FEE_LIST_SELECT_COLUMN,
    colStyle: { width: '3.25rem', minWidth: '3.25rem' },
    headerCell: feeListSelectCheckboxWrap(
      <Checkbox
        checked={
          options.allOnPageSelected ? true : options.someOnPageSelected ? 'indeterminate' : false
        }
        aria-label={options.selectAllAriaLabel ?? 'Select every row on this page'}
        onCheckedChange={(next) => {
          options.toggleAllOnPage(next === true);
        }}
      />,
    ),
    render: (row) => {
      const id = options.getRowId(row);
      return feeListSelectCheckboxWrap(
        <Checkbox
          checked={options.selected.has(id)}
          aria-label={`Select ${options.rowAriaLabel(row)}`}
          onCheckedChange={(next) => {
            options.toggleRowSelected(id, next === true);
          }}
        />,
        { stopRowClick: true },
      );
    },
  };
}
