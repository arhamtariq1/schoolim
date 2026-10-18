import { type ParentVoucherStatus } from '@ilm/contracts';
import { type StatusTone } from '@ilm/ui';

/** A status is always a colour and a word (docs/16 §6). */
export const PARENT_VOUCHER_STATUS_TONES: Readonly<Record<ParentVoucherStatus, StatusTone>> = {
  PAID: 'success',
  UNPAID: 'warning',
  PARTIALLY_PAID: 'info',
  OVERDUE: 'danger',
  WAIVED: 'neutral',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `2026-10` or `2026-10-01` as "October 2026". Pure string work: no timezone to get wrong. */
export function feeMonthLabel(value: string): string {
  const year = value.slice(0, 4);
  const month = MONTHS[Number(value.slice(5, 7)) - 1];
  return month === undefined ? value : `${month} ${year}`;
}

/** A voucher's fee months, or its issue month when it bills none (annual and one-off fees). */
export function voucherMonthsLabel(billMonths: readonly string[], issueDate: string): string {
  return billMonths.length === 0 ? feeMonthLabel(issueDate) : billMonths.map(feeMonthLabel).join(', ');
}
