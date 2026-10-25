import { describe, expect, it } from 'vitest';

import { computeLateFee, lateFeeBaseMinor } from './voucher-generation.service';

const TUITION = 'tuition';
const LAB = 'lab';
const ADMISSION = 'admission';

const lines = [
  { feeHeadId: TUITION, amountMinor: 300_000, discountMinor: 50_000 },
  { feeHeadId: LAB, amountMinor: 100_000, discountMinor: 0 },
  { feeHeadId: ADMISSION, amountMinor: 1_000_000, discountMinor: 0 },
];

describe('lateFeeBaseMinor', () => {
  it('rates only the chosen heads, after discount', () => {
    expect(lateFeeBaseMinor(lines, new Set([TUITION]))).toBe(250_000);
    expect(lateFeeBaseMinor(lines, new Set([TUITION, LAB]))).toBe(350_000);
  });

  it('is zero when no head is chosen', () => {
    expect(lateFeeBaseMinor(lines, new Set())).toBe(0);
  });
});

describe('computeLateFee on the chosen base', () => {
  it('charges a percentage of the base only', () => {
    // 5% of 2,500.00 is 125.00
    expect(computeLateFee(250_000, 500, 0)).toBe(12_500);
  });

  it('charges a fixed amount once when something late-fee bearing is on the voucher', () => {
    expect(computeLateFee(250_000, 0, 20_000)).toBe(20_000);
  });

  it('charges nothing when no chosen head is on the voucher, even with a fixed amount', () => {
    expect(computeLateFee(0, 0, 20_000)).toBe(0);
    expect(computeLateFee(0, 500, 20_000)).toBe(0);
  });
});
