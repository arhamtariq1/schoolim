'use client';

import { PARENT_VOUCHER_STATUS_LABELS, type ParentVoucherItem } from '@ilm/contracts';
import { DateDisplay, Money, StatusBadge, type CardTableColumn } from '@ilm/ui';
import { minorUnits } from '@ilm/utils';

import { feeListTableHeader, FEE_LIST_TABLE_CELL } from '@/components/fees/fee-list-shared';
import { ListDataTable } from '@/components/list-data-table';
import { ParentVoucherDownloadButton } from '@/components/parent-voucher-download-button';
import { PARENT_VOUCHER_STATUS_TONES, voucherMonthsLabel } from '@/lib/parent-vouchers-ui';

const STUDENT_COLUMN: CardTableColumn<ParentVoucherItem> = {
  key: 'student',
  label: 'Child',
  ...FEE_LIST_TABLE_CELL,
  headerCell: feeListTableHeader('Child'),
  render: (row) => <span className="text-sm font-medium text-foreground">{row.studentName}</span>,
};

const COLUMNS: CardTableColumn<ParentVoucherItem>[] = [
  {
    key: 'voucherNo',
    label: 'Voucher no.',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Voucher no.'),
    render: (row) => <span className="text-sm font-medium text-foreground">{row.voucherNo}</span>,
  },
  {
    key: 'month',
    label: 'Fee month',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Fee month'),
    render: (row) => (
      <span className="text-sm">{voucherMonthsLabel(row.billMonths, row.issueDate)}</span>
    ),
  },
  {
    key: 'amount',
    label: 'Amount',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Amount'),
    render: (row) => (
      <Money
        valueMinor={minorUnits(row.totalPayableMinor)}
        withSymbol
        className="text-sm font-medium"
      />
    ),
  },
  {
    key: 'due',
    label: 'Due date',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Due date'),
    render: (row) => <DateDisplay value={row.dueDate} className="text-sm" />,
  },
  {
    key: 'status',
    label: 'Status',
    ...FEE_LIST_TABLE_CELL,
    headerCell: feeListTableHeader('Status'),
    render: (row) => (
      <StatusBadge tone={PARENT_VOUCHER_STATUS_TONES[row.paymentStatus]}>
        {PARENT_VOUCHER_STATUS_LABELS[row.paymentStatus]}
      </StatusBadge>
    ),
  },
  {
    key: 'actions',
    label: 'Action',
    headerClassName: 'w-20 px-2 py-2.5',
    cellClassName: 'w-20 px-2 py-2',
    headerCell: feeListTableHeader('Action'),
    render: (row) => <ParentVoucherDownloadButton id={row.id} voucherNo={row.voucherNo} />,
  },
];

/**
 * The latest vouchers as the platform's own table — the one the office's lists
 * and the parent's Fee vouchers page use — so headers, rows, badges and the phone
 * layout are the same everywhere. Its columns hold functions, which is why it is a
 * client component and the server-drawn dashboard only hands it rows.
 */
export function ParentRecentVouchersTable({
  rows,
  showStudent = false,
}: {
  readonly rows: readonly ParentVoucherItem[];
  /** Several children's vouchers in one list: say whose each one is. */
  readonly showStudent?: boolean;
}) {
  return (
    <ListDataTable
      title="Recent fee vouchers"
      rows={rows}
      columns={showStudent ? [STUDENT_COLUMN, ...COLUMNS] : COLUMNS}
      rowKey={(row) => row.id}
      tableLayout="auto"
      minWidthClass="min-w-[34rem]"
      renderMobileRow={(row) => (
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {row.voucherNo}
              {showStudent ? (
                <span className="font-normal text-muted-foreground"> · {row.studentName}</span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {voucherMonthsLabel(row.billMonths, row.issueDate)} · Due{' '}
              <DateDisplay value={row.dueDate} />
            </p>
            <div className="flex items-center gap-2">
              <Money
                valueMinor={minorUnits(row.totalPayableMinor)}
                withSymbol
                className="text-sm font-medium"
              />
              <StatusBadge tone={PARENT_VOUCHER_STATUS_TONES[row.paymentStatus]}>
                {PARENT_VOUCHER_STATUS_LABELS[row.paymentStatus]}
              </StatusBadge>
            </div>
          </div>
          <ParentVoucherDownloadButton id={row.id} voucherNo={row.voucherNo} />
        </div>
      )}
      empty={{
        title: 'No vouchers yet',
        description: 'When the school issues a fee voucher, it appears here.',
      }}
    />
  );
}
