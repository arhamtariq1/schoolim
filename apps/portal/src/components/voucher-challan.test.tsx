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
    bankLogoVersion?: string;
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
    expect(screen.queryByText(/deposit at/i)).toBeNull();
  });

  it('prints the bank’s name on every copy', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, bankName: 'Meezan Bank Ltd.' });

    expect(screen.getAllByText('Meezan Bank Ltd.')).toHaveLength(3);
    expect(screen.getAllByText(/deposit at/i)).toHaveLength(3);
  });

  it('prints the bank’s mark, versioned so a replacement is not cached', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, bankName: 'Meezan Bank Ltd.' }, VOUCHER, {
      bankLogoVersion: 'b3',
    });

    const marks = screen.getAllByRole('presentation', { hidden: true });
    expect(marks).toHaveLength(3);
    expect(marks[0]?.getAttribute('src')).toContain('v=b3');
  });

  it('prints the mark even with no name, and the name with no mark', () => {
    // Either alone is a complete answer to "where does this get deposited".
    paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, { bankLogoVersion: 'b3' });
    expect(screen.getAllByText(/deposit at/i)).toHaveLength(3);
  });
});

describe('printing in black and white', () => {
  it('has no background fill anywhere on the document', () => {
    // Most schools print this on a mono laser. A document whose structure is
    // carried by tints arrives as a blank grid — so rules, weight and spacing
    // carry it, and the school's colour appears only as borders, which print
    // whatever the "background graphics" box is set to.
    const { container } = paint(BOTH, VOUCHER, { accentColor: '#013131' });

    const filled = [...container.querySelectorAll('*')].filter((element) =>
      /(^|\s)bg-(?!white\b)/.test(element.className.toString()),
    );
    expect(filled.map((element) => element.className.toString())).toEqual([]);
  });

  it('draws the school’s colour as a border, not a strip', () => {
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, { accentColor: '#013131' });

    const copy = container.querySelector('.challan-copy');
    expect(copy?.className).toContain('border-t-[var(--challan-accent)]');
  });
});

describe('filling the sheet', () => {
  it('gives every copy the height of its share of the paper', () => {
    // Otherwise three copies huddle at the top of a landscape A4 and two thirds
    // of the sheet is blank.
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    expect(container.firstElementChild?.getAttribute('style')).toContain('191mm');
    expect(container.querySelector('.challan-copy')?.className).toContain(
      'min-h-[var(--challan-copy-height)]',
    );
  });

  it('gives a quarter-sheet copy the shorter height', () => {
    const { container } = paint({
      ...DEFAULT_VOUCHER_SETTINGS,
      copyCount: 4,
      copyLabels: ['A', 'B', 'C', 'D'],
    });

    expect(container.firstElementChild?.getAttribute('style')).toContain('136mm');
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

  it('puts the slack above the signature, not inside the bill', () => {
    // The charges and the total stay together the way an invoice reads; what
    // is left over lands where a counter stamp goes.
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    const copy = container.querySelector('.challan-copy');
    const spacer = [...(copy?.children ?? [])].filter((child) =>
      child.className.toString().includes('mt-auto'),
    );

    expect(spacer).toHaveLength(1);
    expect(spacer[0]?.textContent).toContain('Signature');
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
    expect(screen.getAllByText('5,000.00')).toHaveLength(6);
  });

  it('prints the two payable figures separately', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);

    // Within the due date: 10,000 of charges plus 5,700 of arrears.
    expect(screen.getAllByText('15,700.00')).toHaveLength(3);
    // After it: the same plus the 200 surcharge. A challan that prints one
    // number cannot tell a parent that paying late costs more.
    expect(screen.getAllByText('15,900.00')).toHaveLength(3);
  });

  it('sets every amount in one fixed column rather than a box of its own', () => {
    // This is the fix for what the first cut got wrong. Three copies across A4
    // leave each about 90mm, and a box sized to hold "15,900.00" beside a label
    // like "Amount payable within due date" does not fit — so the figures
    // overflowed their borders. A single `table-fixed` column is the same width
    // on every row and cannot be squeezed by a long fee name.
    const { container } = paint(DEFAULT_VOUCHER_SETTINGS);

    const table = container.querySelector('table');
    expect(table?.className).toContain('table-fixed');
    expect(table?.querySelectorAll('col')).toHaveLength(2);
    // Wide enough for a seven-figure fee at the total's type size.
    expect(table?.querySelectorAll('col')[1]?.className).toContain('38%');
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
  it('prints it when the school has one and asked for it', () => {
    paint(DEFAULT_VOUCHER_SETTINGS, VOUCHER, { logoVersion: 'v7' });

    const images = screen.getAllByRole('presentation', { hidden: true });
    expect(images).toHaveLength(3);
    // Versioned, or a replaced mark stays cached on every challan printed since.
    expect(images[0]?.getAttribute('src')).toContain('v=v7');
  });

  it('prints nothing when the school has never uploaded one', () => {
    // `showLogo` is on by default, so the absence of an upload — not the
    // setting — has to be what suppresses it. Otherwise every school that has
    // not uploaded a mark prints a broken image on every challan.
    paint(DEFAULT_VOUCHER_SETTINGS);
    expect(screen.queryAllByRole('presentation', { hidden: true })).toHaveLength(0);
  });

  it('prints nothing when the school has one but turned it off', () => {
    paint({ ...DEFAULT_VOUCHER_SETTINGS, showLogo: false }, VOUCHER, { logoVersion: 'v7' });
    expect(screen.queryAllByRole('presentation', { hidden: true })).toHaveLength(0);
  });
});

describe('the payment strip', () => {
  it('is absent for a school with no arrangement', () => {
    paint(DEFAULT_VOUCHER_SETTINGS);

    expect(screen.queryByText('Kuickpay')).toBeNull();
    expect(screen.queryByText(/1LINK/)).toBeNull();
  });

  it('prints the consumer number derived from the prefix and the GR', () => {
    paint(KUICKPAY);
    expect(screen.getAllByText('15140810')).toHaveLength(3);
  });

  it('lists where a parent may pay', () => {
    paint(KUICKPAY);
    expect(screen.getAllByText(/Meezan Bank/)).toHaveLength(3);
    expect(screen.getAllByText(/JazzCash/)).toHaveLength(3);
  });

  it('prints the 1LINK number in front of the Kuickpay one', () => {
    paint(BOTH);
    expect(screen.getAllByText('10004715140810')).toHaveLength(3);
  });

  it('prints no strip at all for a child with no GR number', () => {
    // There is no consumer number to quote, and half a number is worse than
    // none: a parent would be turned away at the counter having been given
    // something that looks payable.
    paint(BOTH, { ...VOUCHER, grNo: null });

    expect(screen.queryByText('Kuickpay')).toBeNull();
    expect(screen.queryByText(/1LINK/)).toBeNull();
  });

  it('keeps the consumer number legible without its background fill', () => {
    // A printer with background graphics off, or any photocopier, drops every
    // tint on the page. The number a parent quotes must survive that, so it
    // carries its own white ground and dark text rather than being reversed
    // out of a filled bar.
    paint(KUICKPAY);

    const chip = screen.getAllByText('15140810')[0]?.parentElement;
    expect(chip?.className).toContain('bg-white');
    expect(chip?.className).toContain('text-black');
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
    // Address and phone share a line, so this matches the element that holds
    // both rather than either on its own.
    expect(
      screen.getAllByText((_, element) => element?.textContent === `${SCHOOL.address}  ·  Ph ${SCHOOL.phone}`),
    ).not.toHaveLength(0);
  });

  it('prints dashes, not blanks, for a child with no section or father recorded', () => {
    // A blank on a printed document reads as an omission somebody should chase.
    // An em dash reads as "nothing recorded", which is what it is.
    paint(DEFAULT_VOUCHER_SETTINGS, { ...VOUCHER, sectionName: null, fatherName: null });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6);
  });
});
