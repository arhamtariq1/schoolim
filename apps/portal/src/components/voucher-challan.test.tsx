import { DEFAULT_VOUCHER_SETTINGS, type Challan, type VoucherSettings } from '@ilm/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { readableAccent, VoucherChallan } from './voucher-challan';

/**
 * What ends up on the paper.
 *
 * A challan is the one artefact of this product that leaves the building. It is
 * checked against a school's records by a clerk, scanned by a bank, and quoted
 * at a Kuickpay counter by a parent who has no way to tell a rendering mistake
 * from a fee they do not owe. So the things asserted here are not the layout —
 * they are the figures and the identifiers, and the fact that nothing legible
 * depends on a background tint that a photocopier will drop.
 */

const SCHOOL = {
  name: 'Demo Public School',
  address: '14-A Gulberg III, Lahore',
  phone: '+924235771400',
};

const VOUCHER: Challan = {
  id: 'v1',
  voucherNo: 'OCT-0001',
  status: 'UNPAID',
  studentId: 's1',
  studentName: 'Kaneez Fatima',
  grNo: '810',
  fatherName: 'Sohail Mustafa',
  className: 'Grade 1',
  sectionName: 'A',
  sessionId: 'sess',
  sessionName: '2026-2027',
  issueDate: '2026-10-01',
  dueDate: '2026-10-10',
  validTill: '2026-10-25',
  billMonths: ['2026-10-01'],
  grossMinor: 1_000_000,
  discountMinor: 0,
  waiverMinor: 0,
  arrearsMinor: 570_000,
  netPayableMinor: 1_000_000,
  totalPayableMinor: 1_570_000,
  lateFeeMinor: 20_000,
  paidMinor: 0,
  balanceMinor: 1_570_000,
  paidOn: null,
  lateFeeAuto: true,
  cancelReason: null,
  lines: [
    {
      id: 'l1',
      feeHeadId: 'h1',
      kind: 'FEE',
      label: 'Tuition Fee - October 2026',
      billMonth: '2026-10-01',
      amountMinor: 500_000,
      discountMinor: 0,
      sortOrder: 1,
    },
    {
      id: 'l2',
      feeHeadId: 'h2',
      kind: 'FEE',
      label: 'Annual Charges',
      billMonth: null,
      amountMinor: 600_000,
      // The discounted figure is what a parent owes, so the row must read
      // 5,000 — not 6,000 with a deduction printed somewhere below it.
      discountMinor: 100_000,
      sortOrder: 2,
    },
  ],
  arrears: [
    {
      sourceVoucherId: 'v0',
      sourceVoucherNo: 'SEP-0001',
      sourceBillMonths: ['2026-09-01'],
      amountMinor: 570_000,
    },
  ],
};

const KUICKPAY: VoucherSettings = {
  ...DEFAULT_VOUCHER_SETTINGS,
  kuickpayEnabled: true,
  kuickpayPrefix: '1514',
  kuickpayChannels: ['Meezan Bank', 'JazzCash'],
};

const BOTH: VoucherSettings = {
  ...KUICKPAY,
  onelinkEnabled: true,
  onelinkInstitutionId: '100047',
};

// This project runs vitest with `globals: false`, so Testing Library's
// automatic cleanup never registers itself. Without this line every render
// accumulates in the same document and "three copies" counts fifty-four by the
// end of the file — a failure that says nothing about the component.
afterEach(cleanup);

function paint(
  settings: VoucherSettings,
  voucher: Challan = VOUCHER,
  extra: {
    logoVersion?: string;
    bankLogos?: { slot: number; version: string }[];
    accentColor?: string;
  } = {},
) {
  return render(
    <VoucherChallan voucher={voucher} school={{ ...SCHOOL, ...extra }} settings={settings} />,
  );
}

describe('the three copies', () => {
  it('prints one per label, in the school’s own words', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, copyLabels: ['Office', 'Bank', 'Parent'] });

    for (const label of ['Office', 'Bank', 'Parent']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Everything else appears three times, once per copy.
    expect(screen.getAllByText('Kaneez Fatima')).toHaveLength(3);
  });

  it('prints three copies even when two share a name', () => {
    // Labels are a school's own text and nothing stops two being identical, so
    // the component cannot key on them.
    paint({ ...DEFAULT_VOUCHER_SETTINGS, copyLabels: ['Copy', 'Copy', 'Copy'] });
    expect(screen.getAllByText('Copy')).toHaveLength(3);
  });

  it('prints four when a school asks for four, two by two', () => {
    const { container } = paint({
      ...DEFAULT_VOUCHER_SETTINGS,
      copyCount: 4,
      copyLabels: ['School Copy', 'Bank Copy', 'Student Copy', 'Office Copy'],
    });

    expect(screen.getAllByText('Kaneez Fatima')).toHaveLength(4);
    expect(screen.getByText('Office Copy')).toBeTruthy();
    // Two across is the 2x2 on a portrait sheet; three go across a landscape one.
    expect(container.firstElementChild?.className).toContain('grid-cols-2');
    expect(container.firstElementChild?.className).toContain('challan-portrait');
  });

  it('puts three across a landscape sheet', () => {
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);
    expect(container.firstElementChild?.className).toContain('grid-cols-3');
    // Landscape is the default page, so three-up asks for nothing — which is
    // what makes it print turned even where a named `@page` cannot apply.
    expect(container.firstElementChild?.className).not.toContain('challan-portrait');
  });
});

describe('the bank at the foot', () => {
  it('prints nothing for a school that collects at its own office', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);
    expect(screen.queryByText('Meezan Bank Ltd.')).toBeNull();
  });

  it('never prints the bank’s name — the uploaded mark stands alone', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, bankName: 'Meezan Bank Ltd.' });

    expect(screen.queryByText('Meezan Bank Ltd.')).toBeNull();
  });

  it('prints the bank’s mark, versioned so a replacement is not cached', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, bankName: 'Meezan Bank Ltd.' }, VOUCHER, {
      bankLogos: [{ slot: 0, version: 'b3' }],
    });

    const marks = screen
      .getAllByRole('presentation', { hidden: true })
      .filter((img) => img.getAttribute('src')?.includes('v=b3'));
    expect(marks).toHaveLength(3);
  });

  it('prints the mark even with no name', () => {
    // A mark alone is a complete answer to "where does this get deposited".
    paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, { bankLogos: [{ slot: 0, version: 'b3' }] });
    const marks = screen
      .getAllByRole('presentation', { hidden: true })
      .filter((img) => img.getAttribute('src')?.includes('v=b3'));
    expect(marks).toHaveLength(3);
  });

  it('prints several banks’ marks in one row, each from its own slot', () => {
    paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, {
      bankLogos: [
        { slot: 0, version: 'm1' },
        { slot: 2, version: 'h1' },
      ],
    });

    const marks = screen
      .getAllByRole('presentation', { hidden: true })
      .map((img) => img.getAttribute('src') ?? '')
      .filter((src) => src.includes('bank-logos'));
    // Two marks on each of three copies, each addressed by its slot.
    expect(marks).toHaveLength(6);
    expect(marks.filter((src) => src.endsWith('/bank-logos/0?v=m1'))).toHaveLength(3);
    expect(marks.filter((src) => src.endsWith('/bank-logos/2?v=h1'))).toHaveLength(3);
  });
});

describe('printing in black and white', () => {
  it('never reverses type out of a solid fill', () => {
    // Light washes (total row, badge, bank box) are fine — dark ink on a pale
    // tint survives a mono laser. White-on-solid does not, so it is banned.
    const { container } = paint(BOTH, VOUCHER, { accentColor: '#013131' });

    const reversed = [...container.querySelectorAll('*')].filter((element) => {
      const className = element.className.toString();
      return /\bbg-(?!white\b|neutral-50\b|neutral-100\b)/.test(className) && /\btext-white\b/.test(className);
    });
    expect(reversed).toEqual([]);
  });

  it('inks each copy in its own theme colour', () => {
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);
    const copies = container.querySelectorAll('.challan-copy');
    expect(copies).toHaveLength(3);
    expect(copies[0]?.getAttribute('style')).toContain('--challan-accent');
  });
});

describe('filling the sheet', () => {
  it('sets nothing smaller than 8px, because this is read at a bank counter', () => {
    // A copy is a 92mm column on a landscape A4 — there is room. The type was
    // once down at 6.5px, which is legible on a screen at 2x and not on paper
    // under a fluorescent light. Anything below this is a figure somebody has
    // to guess at.
    const { container } = paint(BOTH, VOUCHER, { bankLogos: [{ slot: 0, version: 'b1' }] });

    const tooSmall = [...container.querySelectorAll('*')]
      .flatMap((element) => [...element.className.toString().matchAll(/text-\[([\d.]+)px\]/g)])
      .map((match) => Number(match[1]))
      .filter((size) => size < 8);

    expect(tooSmall).toEqual([]);
  });

  it('fills the sheet height rather than leaving a blank lower half', () => {
    // Each copy stretches to the cell; student details flex to absorb slack so
    // the challan does not look half-empty on A4. min-h matches printable area
    // when the parent (print page, dialog) does not set an explicit height.
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    const sheet = container.firstElementChild;
    const copy = container.querySelector('.challan-copy');
    expect(sheet?.className).toContain('min-h-[194mm]');
    expect(copy?.className).toContain('h-full');
    expect(copy?.className).toContain('justify-between');
    expect(copy?.className).toContain('flex-col');
    expect(sheet?.getAttribute('style')).not.toContain('copy-height');
  });

  it('uses the taller printable area for a four-copy portrait sheet', () => {
    const { container } = paint({ ...DEFAULT_VOUCHER_SETTINGS, copyCount: 4 });
    expect(container.firstElementChild?.className).toContain('min-h-[281mm]');
  });

  it('prints one row per charge and nothing else', () => {
    // An earlier cut padded the ledger with ruled blank lines to fill the
    // column. On a real bill that read as a box of empty boxes, so the table
    // now ends where the charges do and the slack goes elsewhere.
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    // Scoped to one copy — the selector would otherwise count all three.
    const copy = container.querySelector('.challan-copy');
    // Two fee lines plus arrears, which is printed even at zero.
    expect(copy?.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(copy?.querySelectorAll('tbody tr[aria-hidden]')).toHaveLength(0);
  });

  it('keeps signatures at the foot of every copy', () => {
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    const copy = container.querySelector('.challan-copy');
    const spacer = [...(copy?.children ?? [])].filter((child) =>
      child.className.toString().includes('mt-auto'),
    );
    expect(spacer).toHaveLength(1);
    expect(spacer[0]?.textContent).toContain('Receiver');
    expect(spacer[0]?.textContent).toContain('Student/Parent Signature');
  });

  it('grows past the minimum for a bill with many charges', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      ...(VOUCHER.lines[0] as (typeof VOUCHER.lines)[number]),
      id: `line-${String(index)}`,
      label: `Fee head ${String(index)}`,
    }));

    const { container } = paint(DEFAULT_VOUCHER_SETTINGS, { ...VOUCHER, lines: many });

    // Twelve charges plus arrears — nothing is dropped to fit the page.
    expect(container.querySelector('.challan-copy')?.querySelectorAll('tbody tr')).toHaveLength(13);
  });
});

describe('the school’s colour', () => {
  it('inks the challan in it when it is dark enough to read', () => {
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, { accentColor: '#013131' });

    expect(readableAccent('#013131')).toBe('#013131');
    expect(container.firstElementChild?.getAttribute('style')).toContain('#013131');
  });

  it('darkens one too light to read, rather than printing it unreadable', () => {
    // A school may choose a bright yellow for its portal, where it lands under
    // white text on a button. Here it is ink on white paper, and docs/16 §6
    // makes 4.5:1 binding — so it is walked darker until it clears.
    //
    // This bites on ordinary choices, not only extreme ones: #1b838e is a
    // perfectly good button colour and still only manages about 3.9:1 as text.
    for (const chosen of ['#ffe600', '#1b838e', '#7dd3fc']) {
      expect(readableAccent(chosen)).not.toBe(chosen);
      expect(contrastWithWhite(readableAccent(chosen))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to a default ink for a school that has chosen nothing', () => {
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    expect(container.firstElementChild?.getAttribute('style')).toContain('--challan-accent');
    expect(contrastWithWhite(readableAccent(undefined))).toBeGreaterThanOrEqual(4.5);
  });
});

/** WCAG contrast of a `#rrggbb` against white, so the test measures what it claims. */
function contrastWithWhite(hex: string): number {
  const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const linear = channels.map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  const luminance =
    0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
  return 1.05 / (luminance + 0.05);
}

describe('the figures', () => {
  it('prints each charge at what is actually owed for it', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);

    // 500,000 paisa = 5,000; and 600,000 less a 100,000 discount = 5,000 too.
    // Two fee rows × three copies. Whole rupees render without trailing zeros.
    expect(screen.getAllByText('5,000')).toHaveLength(6);
  });

  it('prints the total payable on every copy', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);

    // 10,000 of charges plus 5,700 of arrears. The late-fee surcharge is
    // explained in the bank note rather than as a second headline figure —
    // the reference challan carries one total parents can match at the counter.
    expect(screen.getAllByText('15,700')).toHaveLength(3);
    expect(screen.getAllByText('Total Payable')).toHaveLength(3);
  });

  it('sets every amount in one fixed column rather than a box of its own', () => {
    // Three copies across A4 leave each about 90mm. A single `table-fixed`
    // column keeps figures aligned and cannot be squeezed by a long fee name.
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    const table = container.querySelector('table');
    expect(table?.className).toContain('table-fixed');
  });

  it('prints its own number, so a counter payment can be reconciled', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);
    expect(screen.getAllByText('OCT-0001')).toHaveLength(3);
  });

  it('gives the child’s name the full width, so a long one is not cut', () => {
    // A challan that truncates the name is one the office cannot match to a
    // record — and Pakistani names routinely run past half a copy.
    paint(DEFAULT_VOUCHER_SETTINGS, {
      ...VOUCHER,
      studentName: 'Muhammad Abdul Rahman Siddiqui',
    });

    const cell = screen.getAllByText('Muhammad Abdul Rahman Siddiqui')[0];
    expect(cell?.className).toContain('break-words');
    expect(cell?.className).not.toContain('truncate');
  });

  it('names the voucher an arrear came from, so it can be questioned', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);
    expect(screen.getAllByText(/SEP-0001/)).toHaveLength(3);
  });

  it('does not print a discount line — the rows above are already net of it', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);
    expect(screen.queryByText(/Discount/i)).toBeNull();
  });
});

describe('the logo', () => {
  it('prints the school mark when the school has one and asked for it', () => {
    paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, { logoVersion: 'v7' });

    const images = [...document.querySelectorAll('img')].filter((img) =>
      img.getAttribute('src')?.includes('v=v7'),
    );
    expect(images).toHaveLength(3);
  });

  it('falls back to the platform mark when the school has never uploaded one', () => {
    // A blank header looks unfinished. The platform wordmark fills the gap —
    // the same fallback the sidebar uses before a school uploads its own.
    paint(DEFAULT_VOUCHER_SETTINGS);
    const marks = screen.getAllByAltText('Lemma');
    expect(marks).toHaveLength(3);
    expect(marks[0]?.getAttribute('src')).toContain('lemma-logo');
  });

  it('falls back to the platform mark when the school turned school-logo printing off', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, showLogo: false }, VOUCHER, { logoVersion: 'v7' });
    const marks = screen.getAllByAltText('Lemma');
    expect(marks).toHaveLength(3);
  });
});

describe('the payment strip', () => {
  it('is never printed, even for a school that once turned Kuickpay and 1LINK on', () => {
    paint(BOTH);

    expect(screen.queryByText('Kuickpay')).toBeNull();
    expect(screen.queryByText(/1LINK/)).toBeNull();
    expect(screen.queryByText('15140810')).toBeNull();
  });
});

describe('the school’s own words', () => {
  it('prints the footer note when there is one', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, footerNote: 'Pay at any HBL branch.' });
    expect(screen.getAllByText('Pay at any HBL branch.')).toHaveLength(3);
  });

  it('prints no empty box when there is not', () => {
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);
    expect(container.textContent).not.toContain('undefined');
    expect(container.textContent).not.toContain('null');
  });

  it('prints the letterhead on every copy', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);

    expect(screen.getAllByText('Demo Public School')).toHaveLength(3);
    expect(screen.getAllByText(SCHOOL.address)).toHaveLength(3);
    expect(screen.getAllByText(SCHOOL.phone)).toHaveLength(3);
  });

  it('prints dashes, not blanks, for a child with no section or father recorded', () => {
    // A blank on a printed document reads as an omission somebody should chase.
    // An em dash reads as "nothing recorded", which is what it is.
    paint(DEFAULT_VOUCHER_SETTINGS, { ...VOUCHER, sectionName: null, fatherName: null });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6);
  });
});

describe('after the due date', () => {
  it('prints the late fee and the amount payable after the due date on every copy', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);

    expect(screen.getAllByText('Late fee after 10-10-2026')).toHaveLength(3);
    expect(screen.getAllByText('Payable after due date')).toHaveLength(3);
    // 15,700 within the due date + 200 late fee.
    expect(screen.getAllByText('15,900')).toHaveLength(3);
  });

  it('prints no after-due-date rows when the voucher carries no late fee', () => {
    paint(DEFAULT_VOUCHER_SETTINGS, { ...VOUCHER, lateFeeMinor: 0 });

    expect(screen.queryByText('Payable after due date')).toBeNull();
    expect(screen.queryByText(/Late fee after/)).toBeNull();
  });
});

describe('what the school chose to show', () => {
  it('prints the register details, the dates and the bank marks by default', () => {
    paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, { bankLogos: [{ slot: 0, version: 'b1' }] });

    expect(screen.getAllByText('GR No')).toHaveLength(3);
    expect(screen.getAllByText('Issue Date')).toHaveLength(3);
    expect(
      screen
        .getAllByRole('presentation', { hidden: true })
        .filter((img) => img.getAttribute('src')?.includes('bank-logos')),
    ).toHaveLength(3);
  });

  it('drops GR, class, section and session — but never the names', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, showStudentDetails: false });

    for (const label of ['GR No', 'Class', 'Section', 'Session']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getAllByText('Kaneez Fatima')).toHaveLength(3);
    expect(screen.getAllByText('Student Name')).toHaveLength(3);
    expect(screen.getAllByText('Father Name')).toHaveLength(3);
  });

  it('drops the issue and due date rows, but still says when the late fee starts', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, showDates: false });

    expect(screen.queryByText('Issue Date')).toBeNull();
    expect(screen.queryByText('Due Date')).toBeNull();
    // The surcharge line is the figure a parent is charged; its date stays.
    expect(screen.getAllByText('Late fee after 10-10-2026')).toHaveLength(3);
  });

  it('drops the bank marks when the school turns them off', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, showBankLogos: false }, VOUCHER, {
      bankLogos: [{ slot: 0, version: 'b1' }],
    });

    expect(
      screen
        .queryAllByRole('presentation', { hidden: true })
        .filter((img) => img.getAttribute('src')?.includes('bank-logos')),
    ).toHaveLength(0);
  });
});
