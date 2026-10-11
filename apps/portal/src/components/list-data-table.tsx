'use client';

import { CardTable, type CardTableProps } from '@ilm/ui';

/** Fee-vouchers-style embedded table — use inside {@link ListTableScreen}. */
export function ListDataTable<TRow>(
  props: Omit<CardTableProps<TRow>, 'surface' | 'showHeader'> &
    Partial<Pick<CardTableProps<TRow>, 'surface' | 'showHeader' | 'minWidthClass'>>,
) {
  const {
    surface = 'embedded',
    showHeader = false,
    minWidthClass = 'min-w-[56rem]',
    ...rest
  } = props;

  return (
    <CardTable
      surface={surface}
      showHeader={showHeader}
      minWidthClass={minWidthClass}
      {...rest}
    />
  );
}
