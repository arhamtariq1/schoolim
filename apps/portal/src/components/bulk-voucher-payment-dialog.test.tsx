import { type Challan } from '@ilm/contracts';
import { describe, expect, it } from 'vitest';

import { planPayments } from './bulk-voucher-payment-dialog';

/**
 * The preview a person approves before payment is recorded for a selection.
 *
 * The total on the button is the figure somebody checks against the cash in
 * the drawer, so it must not count the same rupee twice — which is exactly
 * what happens if September is selected and October carries September.
 */

function voucher(over: Partial<Challan> & Pick<Challan, 'id' | 'voucherNo'>): Challan {
  return {
    status: 'UNPAID',
    studentId: 's1',
    studentName: 'Kaneez Fatima',
    grNo: '810',
    fatherName: null,
    className: null,
    sectionName: null,
    sessionId: 'sess',
    sessionName: '2026-2027',
    issueDate: '2026-10-01',
    dueDate: '2026-10-10',
    validTill: '2026-10-25',
    billMonths: ['2026-10-01'],
    grossMinor: 300_000,
    discountMinor: 0,
    waiverMinor: 0,
    arrearsMinor: 0,
    netPayableMinor: 300_000,
    totalPayableMinor: 300_000,
    lateFeeMinor: 0,
    paidMinor: 0,
    balanceMinor: 300_000,
    paidOn: null,
    lateFeeAuto: false,
    cancelReason: null,
    lines: [],
    arrears: [],
    ...over,
  };
}

describe('the bulk payment preview', () => {
  it('settles each open voucher for what it owes, and totals them', () => {
    const plan = planPayments([
      voucher({ id: 'a', voucherNo: 'OCT-1' }),
      voucher({ id: 'b', voucherNo: 'OCT-2', paidMinor: 100_000, status: 'PARTIALLY_PAID' }),
    ]);

    expect(plan.payable.map((row) => row.amountMinor)).toEqual([300_000, 200_000]);
    expect(plan.totalMinor).toBe(500_000);
  });

  it('leaves out what is already settled or cancelled, and names it', () => {
    const plan = planPayments([
      voucher({ id: 'a', voucherNo: 'OCT-1' }),
      voucher({ id: 'b', voucherNo: 'OCT-2', status: 'PAID', paidMinor: 300_000 }),
      voucher({ id: 'c', voucherNo: 'OCT-3', status: 'CANCELLED' }),
    ]);

    expect(plan.payable.map((row) => row.voucherNo)).toEqual(['OCT-1']);
    expect(plan.excluded.map((row) => row.voucherNo)).toEqual(['OCT-2', 'OCT-3']);
  });

  it('does not count arrears twice when the voucher they came from is selected too', () => {
    const september = voucher({ id: 'sep', voucherNo: 'SEP-1', dueDate: '2026-09-10' });
    const october = voucher({
      id: 'oct',
      voucherNo: 'OCT-1',
      arrearsMinor: 300_000,
      totalPayableMinor: 600_000,
      arrears: [
        {
          sourceVoucherId: 'sep',
          sourceVoucherNo: 'SEP-1',
          sourceBillMonths: ['2026-09-01'],
          amountMinor: 300_000,
        },
      ],
    });

    const plan = planPayments([october, september]);

    // September is paid on its own receipt, first; October only its own month.
    expect(plan.payable.map((row) => [row.voucherNo, row.amountMinor])).toEqual([
      ['SEP-1', 300_000],
      ['OCT-1', 300_000],
    ]);
    expect(plan.totalMinor).toBe(600_000);
  });

  it('keeps the arrears on the voucher when the older one is not in the selection', () => {
    const october = voucher({
      id: 'oct',
      voucherNo: 'OCT-1',
      totalPayableMinor: 600_000,
      arrears: [
        {
          sourceVoucherId: 'sep',
          sourceVoucherNo: 'SEP-1',
          sourceBillMonths: ['2026-09-01'],
          amountMinor: 300_000,
        },
      ],
    });

    expect(planPayments([october]).totalMinor).toBe(600_000);
  });
});
