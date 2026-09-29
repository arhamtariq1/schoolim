import { z } from 'zod';

/**
 * How a school's fee challan looks, and how a parent pays it.
 *
 * ## Why this is configuration and not code
 *
 * Two schools on this product print different challans. One has a logo and a
 * Kuickpay arrangement; one is a single campus with a bank slip and a rubber
 * stamp. CLAUDE.md R1 says the difference between them is configuration or it
 * is not built, and a challan is the document where that rule earns its keep:
 * it is the one page of this product that leaves the building, crosses a bank
 * counter, and comes back.
 *
 * ## Why the consumer numbers are derived
 *
 * Kuickpay issues a school a company prefix. The number a parent quotes is that
 * prefix followed by the child's register number — so a school with 2,000
 * children has one setting, not 2,000 stored numbers that drift the day the
 * prefix is corrected. 1LINK prints its institution id in front of the same
 * number. Both are computed where the challan is rendered, by
 * {@link kuickpayConsumerNo} and {@link onelinkConsumerNo}, so the screen, the
 * print run and any future PDF cannot disagree about what a parent should type.
 */

/**
 * How many copies fit on a sheet, and therefore how the sheet is laid out.
 *
 * Three stack down an A4 portrait as full-width strips; four sit in a 2x2. They
 * are the only two arrangements that give a copy enough room to be read at a
 * counter, so this is a pair of numbers rather than a free integer — five
 * copies on a page is five copies nobody can read.
 */
export const COPY_COUNTS = [3, 4] as const;

export type CopyCount = (typeof COPY_COUNTS)[number];

export const DEFAULT_COPY_COUNT: CopyCount = 3;

/**
 * The names a school starts with, for each count.
 *
 * A school moving from three copies to four should not be handed a blank
 * heading to fill in, so the fourth arrives named — and the first three keep
 * whatever the school had already called them.
 */
export const DEFAULT_COPY_LABELS: Readonly<Record<CopyCount, readonly string[]>> = {
  3: ['School Copy', 'Bank Copy', 'Student Copy'],
  4: ['School Copy', 'Bank Copy', 'Student Copy', 'Office Copy'],
};

/**
 * Kuickpay's network, as it stood when this was written.
 *
 * A default rather than a constant: it is the list every school starts with and
 * the one most will keep, but Kuickpay adds and drops partners without asking
 * us, and a school should not need a release to correct what its own challan
 * says parents can do.
 */
export const DEFAULT_KUICKPAY_CHANNELS = [
  'Meezan Bank',
  'Bank Islami',
  'Leopard Courier',
  'E-Sahulat',
  'Omni (UBL)',
  'Askari Bank',
  'JazzCash',
  'Konnect (HBL)',
  'EasyPaisa',
  'NRSP',
  'Al Baraka Bank',
  'HBL Metro',
] as const;

/**
 * Digits only, and bounded at both ends.
 *
 * This is interpolated into a number printed on a document a bank scans. A
 * prefix with a space in it is a challan nobody can pay, and the failure is
 * discovered at a counter by a parent rather than here.
 */
const digitsSchema = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^[0-9]{${String(min)},${String(max)}}$`), `${label} is digits only.`);

export const copyCountSchema = z.union([z.literal(3), z.literal(4)]);

export const voucherSettingsSchema = z.object({
  showLogo: z.boolean(),
  footerNote: z.string().nullable(),
  copyCount: copyCountSchema,
  copyLabels: z.array(z.string()),
  /** The bank a parent deposits at. Its mark is uploaded separately. */
  bankName: z.string().nullable(),
  kuickpayEnabled: z.boolean(),
  kuickpayPrefix: z.string().nullable(),
  kuickpayChannels: z.array(z.string()),
  onelinkEnabled: z.boolean(),
  onelinkInstitutionId: z.string().nullable(),
});

export type VoucherSettings = z.infer<typeof voucherSettingsSchema>;

/**
 * What the settings screen saves.
 *
 * The three cross-field rules are here as well as in the database. The database
 * ones are what a second writer cannot get past; these are what a person gets
 * told, beside the field they need to fix.
 */
export const updateVoucherSettingsSchema = z
  .object({
    showLogo: z.boolean(),
    /** Blank is stored as null: "no note" has one representation, not two. */
    footerNote: z
      .string()
      .trim()
      .max(400, 'Keep the note under 400 characters.')
      .nullable()
      .transform((value) => (value === null || value === '' ? null : value)),
    copyCount: copyCountSchema,
    copyLabels: z.array(z.string().trim().min(1, 'Name each copy.').max(40)),
    bankName: z
      .string()
      .trim()
      .max(60, 'Keep the bank name under 60 characters.')
      .nullable()
      .transform((value) => (value === null || value === '' ? null : value)),
    kuickpayEnabled: z.boolean(),
    kuickpayPrefix: digitsSchema(2, 12, 'The Kuickpay prefix').nullable(),
    kuickpayChannels: z.array(z.string().trim().min(1).max(40)).max(30),
    onelinkEnabled: z.boolean(),
    onelinkInstitutionId: digitsSchema(3, 12, 'The 1LINK institution ID').nullable(),
  })
  .strict()
  .refine((value) => value.copyLabels.length === value.copyCount, {
    // The database says the same as a check constraint. A fourth copy with no
    // name is a blank heading on a printed document.
    message: 'Name every copy — one label per copy.',
    path: ['copyLabels'],
  })
  .refine((value) => !value.kuickpayEnabled || value.kuickpayPrefix !== null, {
    message: 'Kuickpay needs the company prefix they issued you.',
    path: ['kuickpayPrefix'],
  })
  .refine((value) => !value.onelinkEnabled || value.onelinkInstitutionId !== null, {
    message: '1LINK needs your institution ID.',
    path: ['onelinkInstitutionId'],
  })
  .refine((value) => !value.onelinkEnabled || value.kuickpayEnabled, {
    // 1LINK prints its id in front of the Kuickpay consumer number, so without
    // Kuickpay there is no number for it to print.
    message: 'Turn Kuickpay on first — the 1LINK number is built on top of it.',
    path: ['onelinkEnabled'],
  });

export type UpdateVoucherSettings = z.infer<typeof updateVoucherSettingsSchema>;

/** The product's challan, for a school that has never opened the settings. */
export const DEFAULT_VOUCHER_SETTINGS: VoucherSettings = {
  showLogo: true,
  footerNote: null,
  copyCount: DEFAULT_COPY_COUNT,
  copyLabels: [...DEFAULT_COPY_LABELS[DEFAULT_COPY_COUNT]],
  bankName: null,
  kuickpayEnabled: false,
  kuickpayPrefix: null,
  kuickpayChannels: [...DEFAULT_KUICKPAY_CHANNELS],
  onelinkEnabled: false,
  onelinkInstitutionId: null,
};

/**
 * The number a parent quotes at a Kuickpay counter.
 *
 * The school's company prefix, then the child's register number padded to four
 * digits — which is the shape every Kuickpay challan in this market carries,
 * and the reason the GR number is padded at all.
 *
 * Returns undefined when the school has not set Kuickpay up, or when the child
 * has no GR number, so the caller prints nothing rather than a half a number.
 */
export function kuickpayConsumerNo(
  settings: Pick<VoucherSettings, 'kuickpayEnabled' | 'kuickpayPrefix'>,
  grNo: string | null,
): string | undefined {
  if (!settings.kuickpayEnabled || settings.kuickpayPrefix === null) {
    return undefined;
  }

  const digits = (grNo ?? '').replace(/\D/g, '');
  if (digits === '') {
    return undefined;
  }

  return `${settings.kuickpayPrefix}${digits.padStart(4, '0')}`;
}

/**
 * The 1LINK number: the institution id in front of the Kuickpay one.
 *
 * Undefined whenever the Kuickpay number is, because there would be nothing
 * behind the institution id — which is the same rule the database holds as a
 * check constraint rather than two places quietly disagreeing.
 */
export function onelinkConsumerNo(
  settings: Pick<
    VoucherSettings,
    'kuickpayEnabled' | 'kuickpayPrefix' | 'onelinkEnabled' | 'onelinkInstitutionId'
  >,
  grNo: string | null,
): string | undefined {
  if (!settings.onelinkEnabled || settings.onelinkInstitutionId === null) {
    return undefined;
  }

  const kuickpay = kuickpayConsumerNo(settings, grNo);
  return kuickpay === undefined ? undefined : `${settings.onelinkInstitutionId}${kuickpay}`;
}
