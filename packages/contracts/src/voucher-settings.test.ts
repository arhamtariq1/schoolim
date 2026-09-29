import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VOUCHER_SETTINGS,
  kuickpayConsumerNo,
  onelinkConsumerNo,
  updateVoucherSettingsSchema,
  type VoucherSettings,
} from './voucher-settings';

/**
 * The numbers printed on a challan.
 *
 * These are the only values in the product that a person reads off paper and
 * types into somebody else's system. A wrong one is not a rendering bug — it is
 * a parent at a Kuickpay counter being told the number does not exist, and a
 * school that finds out from the parent.
 */

const KUICKPAY: VoucherSettings = {
  ...DEFAULT_VOUCHER_SETTINGS,
  kuickpayEnabled: true,
  kuickpayPrefix: '1514',
};

const BOTH: VoucherSettings = {
  ...KUICKPAY,
  onelinkEnabled: true,
  onelinkInstitutionId: '100047',
};

describe('the Kuickpay consumer number', () => {
  it('is the company prefix followed by the padded register number', () => {
    // Prefix 1514, GR 810 → 15140810, which is the shape every Kuickpay
    // challan in this market carries.
    expect(kuickpayConsumerNo(KUICKPAY, '810')).toBe('15140810');
  });

  it('pads a short register number and leaves a long one alone', () => {
    expect(kuickpayConsumerNo(KUICKPAY, '7')).toBe('15140007');
    expect(kuickpayConsumerNo(KUICKPAY, '12345')).toBe('151412345');
  });

  it('takes the digits out of a register number that has other characters', () => {
    // A school importing a legacy register may carry "GR-0810" or "810/A". The
    // number a bank scans cannot contain either.
    expect(kuickpayConsumerNo(KUICKPAY, 'GR-0810')).toBe('15140810');
  });

  it('prints nothing rather than half a number', () => {
    expect(kuickpayConsumerNo(KUICKPAY, null)).toBeUndefined();
    expect(kuickpayConsumerNo(KUICKPAY, '')).toBeUndefined();
    expect(kuickpayConsumerNo(KUICKPAY, 'no digits here')).toBeUndefined();
  });

  it('prints nothing for a school that does not use Kuickpay', () => {
    expect(kuickpayConsumerNo(DEFAULT_VOUCHER_SETTINGS, '810')).toBeUndefined();
    expect(kuickpayConsumerNo({ kuickpayEnabled: true, kuickpayPrefix: null }, '810')).toBeUndefined();
  });
});

describe('the 1LINK number', () => {
  it('is the institution ID in front of the Kuickpay number', () => {
    expect(onelinkConsumerNo(BOTH, '810')).toBe('10004715140810');
  });

  it('is absent whenever the Kuickpay number is', () => {
    // Nothing to put behind the institution id. The database holds the same
    // rule as a check constraint rather than the two quietly disagreeing.
    expect(onelinkConsumerNo(BOTH, null)).toBeUndefined();
    expect(onelinkConsumerNo({ ...BOTH, kuickpayEnabled: false }, '810')).toBeUndefined();
  });

  it('is absent for a school that has not turned it on', () => {
    expect(onelinkConsumerNo(KUICKPAY, '810')).toBeUndefined();
  });
});

describe('what the settings form will accept', () => {
  const valid = {
    showLogo: true,
    footerNote: 'Fees paid after the due date attract a surcharge.',
    copyLabels: ['School Copy', 'Bank Copy', 'Student Copy'],
    kuickpayEnabled: true,
    kuickpayPrefix: '1514',
    kuickpayChannels: ['Meezan Bank'],
    onelinkEnabled: true,
    onelinkInstitutionId: '100047',
  };

  it('accepts a school with both channels configured', () => {
    expect(updateVoucherSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses Kuickpay without the prefix it needs', () => {
    const result = updateVoucherSettingsSchema.safeParse({
      ...valid,
      kuickpayPrefix: null,
      onelinkEnabled: false,
      onelinkInstitutionId: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['kuickpayPrefix']);
  });

  it('refuses 1LINK without Kuickpay underneath it', () => {
    const result = updateVoucherSettingsSchema.safeParse({
      ...valid,
      kuickpayEnabled: false,
      kuickpayPrefix: null,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === 'onelinkEnabled')).toBe(true);
  });

  it('refuses a prefix that is not digits', () => {
    for (const bad of ['15 14', '1514A', '+1514', '1', '']) {
      expect(updateVoucherSettingsSchema.safeParse({ ...valid, kuickpayPrefix: bad }).success).toBe(
        false,
      );
    }
  });

  it('insists on three copies, because a challan has three', () => {
    expect(
      updateVoucherSettingsSchema.safeParse({ ...valid, copyLabels: ['One', 'Two'] }).success,
    ).toBe(false);
    expect(
      updateVoucherSettingsSchema.safeParse({ ...valid, copyLabels: ['A', 'B', 'C', 'D'] }).success,
    ).toBe(false);
  });

  it('stores a blank note as nothing, so "no note" has one spelling', () => {
    const result = updateVoucherSettingsSchema.parse({ ...valid, footerNote: '   ' });
    expect(result.footerNote).toBeNull();
  });

  it('rejects an unknown field rather than ignoring it', () => {
    expect(
      updateVoucherSettingsSchema.safeParse({ ...valid, easypaisaEnabled: true }).success,
    ).toBe(false);
  });
});
