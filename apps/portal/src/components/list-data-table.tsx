'use client';

import { CardTable, type CardTableProps } from '@ilm/ui';

/** Fee-vouchers-style embedded table — use inside {@link ListTableScreen}. */
export function ListDataTable<TRow>(
  props: Omit<CardTableProps<TRow>, 'surface' | 'showHeader' | 'title'> &
    Partial<Pick<CardTableProps<TRow>, 'surface' | 'showHeader' | 'minWidthClass' | 'title'>>,
) {
  const {
    surface = 'embedded',
    showHeader = false,
    minWidthClass = 'min-w-[56rem]',
    title = '',
    ...rest
  } = props;

  return (
    <CardTable
      title={title}
      surface={surface}
      showHeader={showHeader}
      minWidthClass={minWidthClass}
      {...rest}
    />
  );
}
