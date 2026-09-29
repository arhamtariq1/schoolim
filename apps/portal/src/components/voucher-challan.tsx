'use client';

import {
  kuickpayConsumerNo,
  onelinkConsumerNo,
  ROUTES,
  type Challan,
  type VoucherSettings,
} from '@ilm/contracts';
import { Money } from '@ilm/ui';
import { type CSSProperties, type ReactNode } from 'react';

/**
 * The printed fee challan.
 *
 * ## Three copies down the page, or four in a square
 *
 * A4 portrait either way. Three copies are full-width strips stacked down the
 * sheet; four sit in a 2x2. They are the only two arrangements that leave a
 * copy big enough to read at a counter, and which one a school uses is
 * `copyCount` — CLAUDE.md R1, on the one document of this product that leaves
 * the building.
 *
 * The two shapes are genuinely different — a strip is 194x93mm and a quarter is
 * 96x140mm — so the body lays itself out accordingly: side by side when there is
 * width to spend, stacked when there is not. Everything else is identical,
 * because it is the same document.
 *
 * ## Why nothing legible depends on a fill
 *
 * This is designed for paper. A printer with "background graphics" off, and
 * every photocopier, drops background colour — so **every fill on this document
 * is a light tint carrying dark text**, never the reverse. Lose the tints and
 * the challan is still correct in flat black on white; keep them and it looks
 * like something a school would be happy to send home. `globals.css` asks for
 * them with `print-color-adjust`, and this is what makes that a nicety rather
 * than a dependency.
 *
 * The school's own brand colour is the accent, darkened if need be until it
 * clears 4.5:1 against white (docs/16 §6). It is passed as a hex and set as a
 * custom property: the one place raw colour is right, because a printed page
 * must not follow the portal's theme — a challan in dark mode is a black sheet
 * of paper.
 *
 * ## Two figures, deliberately
 *
 * "Payable within due date" and "payable after" are separate rows, because they
 * are separate amounts and the surcharge applies only to one. Printing a single
 * total is how a parent who paid on time is charged a late fee.
 */

export interface ChallanProps {
  /**
   * `Challan`, not `VoucherDetail`: a challan is the demand, not the receipt,
   * and it prints no payments. Taking the narrower shape lets the single
   * preview pass a full detail and a print run of five hundred pass a response
   * that never joined the allocations at all.
   */
  voucher: Challan;
  school: {
    name: string;
    address?: string | undefined;
    phone?: string | undefined;
    /** Version string for the logo URL, so a replaced mark is not cached. */
    logoVersion?: string | undefined;
    /** The same, for the bank's mark at the foot. */
    bankLogoVersion?: string | undefined;
    /** The school's brand colour, `#rrggbb`. Absent means the default ink. */
    accentColor?: string | undefined;
  };
  settings: VoucherSettings;
}

export function VoucherChallan({ voucher, school, settings }: ChallanProps) {
  const accent = readableAccent(school.accentColor);

  return (
    <div
      className={`voucher-challan grid gap-3 ${
        // `challan-landscape` is what turns the sheet, via a named `@page` in
        // globals.css. Three copies across a landscape A4 gives each one a
        // 92x194mm column; four on a portrait sheet gives 97x140mm. Both are
        // tall and narrow, which is why one copy design serves both.
        settings.copyCount === 4 ? 'grid-cols-2' : 'challan-landscape grid-cols-3'
      }`}
      // Set once on the container and inherited by every copy. They have to be
      // inline because the values are one school's data — the cast is how a
      // custom property is written into a typed style object.
      style={
        {
          '--challan-accent': accent,
          '--challan-rule': mixWithWhite(accent, 30),
          // The height of one copy, so the copies fill the sheet instead of
          // huddling at the top of it. A landscape A4 at 8mm margins is 194mm
          // of usable height; a portrait one halves into two rows of about
          // 138mm, less the gap between them.
          '--challan-copy-height': settings.copyCount === 4 ? '136mm' : '191mm',
        } as CSSProperties
      }
    >
      {settings.copyLabels.map((copy, index) => (
        <ChallanCopy
          // Labels are a school's own text and two of them can be identical.
          // The index is the only stable identity a copy has.
          key={`${copy}-${String(index)}`}
          copy={copy}
          voucher={voucher}
          school={school}
          settings={settings}
        />
      ))}
    </div>
  );
}

function ChallanCopy({ copy, voucher, school, settings }: ChallanProps & { copy: string }) {
  const charges = voucher.lines.filter((line) => line.kind === 'FEE');
  const afterDue = voucher.totalPayableMinor + voucher.lateFeeMinor;

  const kuickpay = kuickpayConsumerNo(settings, voucher.grNo);
  const onelink = onelinkConsumerNo(settings, voucher.grNo);
  const showLogo = settings.showLogo && school.logoVersion !== undefined;
  const showBank = settings.bankName !== null || school.bankLogoVersion !== undefined;

  return (
    // The 3px top rule is a *border*, not a filled strip. Borders print when
    // background colours do not, so the one mark of the school's colour on the
    // page is the one mark certain to survive a black-and-white printer.
    <article className="challan-copy flex min-h-[var(--challan-copy-height)] break-inside-avoid flex-col overflow-hidden rounded-lg border border-t-[3px] border-neutral-300 border-t-[var(--challan-accent)] bg-white text-[9px] leading-snug text-neutral-900">
      {/* Which copy this is, and which challan. */}
      <div className="flex items-center justify-between gap-2 px-3.5 pt-2">
        <span className="rounded-full border border-[var(--challan-rule)] px-2 py-[1px] text-[7px] font-bold tracking-[0.16em] text-[var(--challan-accent)] uppercase">
          {copy}
        </span>
        <span className="font-mono text-[8px] font-semibold tracking-wide text-neutral-500">
          {voucher.voucherNo}
        </span>
      </div>

      <header className="flex items-center gap-2.5 px-3.5 pt-2 pb-2.5">
        {showLogo ? (
          // A plain `img`: this is printed, so there is nothing for Next's
          // image pipeline to optimise, and a `next/image` here would be a
          // layout-shifting placeholder on a page whose only job is to be laid
          // out once and sent to a printer.
          <img
            src={`${ROUTES.schoolLogo.image}?v=${school.logoVersion ?? ''}`}
            alt=""
            className="size-10 shrink-0 object-contain"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] leading-[1.15] font-bold tracking-tight text-balance">
            {school.name}
          </h3>
          <p className="mt-0.5 truncate text-[7.5px] leading-tight text-neutral-500">
            {[school.address, school.phone === undefined ? undefined : `Ph ${school.phone}`]
              .filter((part) => part !== undefined)
              .join('  ·  ')}
          </p>
        </div>
      </header>

      <Particulars voucher={voucher} />

      {/* Grows, so any slack the ruled lines do not take lands here rather than
          under the signature — the totals sit where the eye ends up. */}
      <div className="flex-1">
        <Charges
          charges={charges}
          voucher={voucher}
          // How many ruled lines the copy has room for. A landscape column is
          // 194mm tall and a portrait quarter 138mm, so the shorter one gets
          // fewer — padding it to the same count would push the total off the
          // bottom of the sheet.
          ledgerRows={settings.copyCount === 4 ? 6 : 10}
        />
      </div>

      <Totals voucher={voucher} afterDue={afterDue} />

      {settings.footerNote === null ? null : (
        <p className="px-3.5 pt-1.5 text-[7px] leading-snug text-neutral-500">
          {settings.footerNote}
        </p>
      )}

      <div className="flex items-end justify-between gap-3 px-3.5 pt-3 pb-2">
        {showBank ? (
          <span className="flex min-w-0 items-center gap-1.5">
            {school.bankLogoVersion === undefined ? null : (
              <img
                src={`${ROUTES.bankLogo.image}?v=${school.bankLogoVersion}`}
                alt=""
                className="h-6 w-auto max-w-16 shrink-0 object-contain"
              />
            )}
            <span className="min-w-0">
              <Micro>Deposit at</Micro>
              {settings.bankName === null ? null : (
                <span className="block truncate text-[8px] font-semibold">{settings.bankName}</span>
              )}
            </span>
          </span>
        ) : (
          <span />
        )}

        <span className="w-24 shrink-0 border-t border-dotted border-neutral-400 pt-1 text-center text-[6.5px] tracking-wide text-neutral-500 uppercase">
          Receiver&rsquo;s Signature
        </span>
      </div>

      {kuickpay === undefined ? null : (
        <PaymentBlock
          kuickpay={kuickpay}
          onelink={onelink}
          channels={settings.kuickpayChannels}
        />
      )}
    </article>
  );
}

/**
 * Whose child this is, and which dates govern it.
 *
 * The names take the full width and are allowed to wrap: half a quarter-sheet
 * is about 40mm and "Muhammad Abdul Rahman Siddiqui" does not fit in it. A
 * challan that truncates the child's name is one the office cannot match to a
 * record.
 */
function Particulars({ voucher }: { voucher: Challan }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-y border-neutral-200 px-3.5 py-2.5">
      <Pair label="Student" value={voucher.studentName} span />
      <Pair label="Father" value={voucher.fatherName ?? '—'} span />
      <Pair label="GR No" value={voucher.grNo ?? '—'} />
      <Pair label="Class" value={`${voucher.className ?? '—'}`} />
      <Pair label="Section" value={voucher.sectionName ?? '—'} />
      <Pair label="Session" value={voucher.sessionName} />
      <Pair label="Issued" value={formatDate(voucher.issueDate)} />
      <Pair label="Due date" value={formatDate(voucher.dueDate)} />
      <Pair label="Valid till" value={formatDate(voucher.validTill)} />
    </dl>
  );
}

/**
 * The charges, in one amount column.
 *
 * `table-fixed` is what holds the column to the same width on every row — and
 * what stops a long fee name from squeezing the figure until it wraps. A box
 * per figure, which is what this started as, cannot be made to fit beside a
 * label in 90mm.
 */
function Charges({
  charges,
  voucher,
  ledgerRows,
}: {
  charges: Challan['lines'];
  voucher: Challan;
  ledgerRows: number;
}) {
  // Arrears is always printed, even at zero — "you owe nothing from before" is
  // information a parent wants — so it counts towards the ruled lines.
  const printed = charges.length + (voucher.waiverMinor > 0 ? 1 : 0) + 1;
  const blanks = Math.max(0, ledgerRows - printed);

  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col />
        <col className="w-[38%]" />
      </colgroup>

      <thead>
        <tr className="border-b border-[var(--challan-rule)]">
          <th className="px-3.5 pt-2.5 pb-1 text-left">
            <Micro>Particulars</Micro>
          </th>
          <th className="px-3.5 pt-2.5 pb-1 text-right">
            <Micro>Amount (Rs.)</Micro>
          </th>
        </tr>
      </thead>

      <tbody>
        {charges.map((line) => (
          <Charge
            key={line.id}
            label={line.label}
            // Each fee line is already the discounted figure a parent owes. No
            // separate discount row: printing "−1,500" under a total that does
            // not move looks like an arithmetic mistake on the school's own
            // challan, and what was agreed privately with one family is not for
            // a document that crosses a bank counter.
            minor={line.amountMinor - line.discountMinor}
          />
        ))}

        {voucher.waiverMinor > 0 ? <Charge label="Waived" minor={-voucher.waiverMinor} /> : null}

        <Charge
          label="Arrears"
          hint={
            voucher.arrears.length === 0
              ? undefined
              : voucher.arrears.map((entry) => entry.sourceVoucherNo).join(', ')
          }
          minor={voucher.arrearsMinor}
        />

        {/* Ruled blank lines to the foot of the ledger, the way a printed
            challan has always been set. Without them a two-line bill leaves a
            hand-span of white between the last charge and the total, which
            reads as a page that failed to finish rather than one with nothing
            more to say. They are decoration, so they are hidden from anyone
            listening to the document rather than looking at it. */}
        {Array.from({ length: blanks }, (_, index) => (
          <tr key={`blank-${String(index)}`} aria-hidden className="border-b border-neutral-200">
            <td className="px-3.5 py-[3.5px]">&nbsp;</td>
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The figure this document exists to communicate, and the one after it. */
function Totals({ voucher, afterDue }: { voucher: Challan; afterDue: number }) {
  return (
    <div className="border-y-2 border-[var(--challan-accent)]">
      <div className="flex items-end justify-between gap-2 px-3.5 pt-2">
        {/* Black, not the accent: this is the label on the one figure the
            document exists to carry, and most schools print in black and
            white, where a colour is only ever a weaker grey. */}
        <span className="pb-[3px] text-[7.5px] font-bold tracking-[0.1em] text-neutral-900 uppercase">
          Payable
          <br />
          within due date
        </span>
        <span className="font-mono text-[19px] leading-none font-bold tracking-tight tabular-nums">
          <Money valueMinor={voucher.totalPayableMinor} withSymbol={false} />
        </span>
      </div>

      {/* Printed even when it equals the figure above: a parent who sees only
          one number cannot tell whether paying late costs more. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-[var(--challan-rule)] px-3.5 py-1">
        <span className="text-[7.5px] text-neutral-500">
          After {formatDate(voucher.dueDate)}
        </span>
        <span className="font-mono text-[10px] font-semibold tabular-nums text-neutral-700">
          <Money valueMinor={afterDue} withSymbol={false} />
        </span>
      </div>
    </div>
  );
}

/**
 * The strip a parent uses to pay.
 *
 * Tinted, not filled: the consumer number is the single most important thing on
 * the page for a parent, and reversing it out of a solid bar means it vanishes
 * on any printer that drops backgrounds. The number itself sits in a white,
 * bordered chip so it reads as something to be copied.
 */
function PaymentBlock({
  kuickpay,
  onelink,
  channels,
}: {
  kuickpay: string;
  onelink: string | undefined;
  channels: readonly string[];
}) {
  return (
    <div className="border-t border-[var(--challan-rule)]">
      <div className="flex items-center justify-between gap-2 px-3.5 py-1.5">
        <span className="text-[10px] font-bold tracking-tight text-[var(--challan-accent)]">
          Kuickpay
        </span>
        <span className="flex items-center gap-1.5 rounded border border-neutral-400 bg-white px-2 py-0.5 text-black">
          <span className="text-[6.5px] tracking-wide text-neutral-500 uppercase">ID</span>
          <span className="font-mono text-[11px] font-bold tracking-wider">{kuickpay}</span>
        </span>
      </div>

      {channels.length === 0 ? null : (
        <div className="px-3.5 pb-1.5">
          <Micro>Pay in cash at</Micro>
          {/* Two columns: a copy is about 92mm wide, and twelve outlet names
              down one side is a strip taller than the challan it belongs to. */}
          <ul className="mt-0.5 grid grid-cols-2 gap-x-2 text-[6.5px] leading-snug text-neutral-600">
            {channels.map((channel) => (
              <li key={channel} className="truncate">
                {channel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onelink === undefined ? null : (
        <p className="border-t border-[var(--challan-rule)] px-3.5 py-1 text-center text-[8px]">
          <span className="text-neutral-500">1LINK ID</span>{' '}
          <span className="font-mono font-semibold tracking-wider">{onelink}</span>
        </p>
      )}
    </div>
  );
}

/** The one type style every small-caps label on this document uses. */
const MICRO = 'text-[6.5px] leading-tight tracking-[0.12em] text-neutral-500 uppercase';

/**
 * A label/value pair.
 *
 * The `div` wrapper is what HTML5 permits inside a `dl` to group a `dt` with
 * its `dd`, so the pair can be a grid cell without the list losing its
 * semantics.
 */
function Pair({ label, value, span = false }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-full min-w-0' : 'min-w-0'}>
      <dt className={MICRO}>{label}</dt>
      {/* A name wraps; everything else is short and truncates rather than
          reflowing the grid. */}
      <dd className={`font-semibold ${span ? 'break-words' : 'truncate'}`}>{value}</dd>
    </div>
  );
}

/** The same style outside a description list — a table heading, a strip label. */
function Micro({ children }: { children: ReactNode }) {
  return <span className={`block ${MICRO}`}>{children}</span>;
}

/** A charge and its amount, in the ledger column. */
function Charge({
  label,
  hint,
  minor,
}: {
  label: string;
  hint?: string | undefined;
  minor: number;
}) {
  return (
    <tr className="border-b border-neutral-200 last:border-b-0">
      <td className="truncate px-3.5 py-[3.5px]">
        {label}
        {hint === undefined ? null : (
          <span className="ms-1 text-[7px] text-neutral-500">({hint})</span>
        )}
      </td>
      <td className="px-3.5 py-[3.5px] text-right font-mono tabular-nums">
        <Money valueMinor={minor} withSymbol={false} />
      </td>
    </tr>
  );
}

/** `2026-09-01` → `01-09-2026`, which is how a Pakistani challan reads. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day ?? ''}-${month ?? ''}-${year ?? ''}`;
}

/** The default ink, for a school that has not chosen a colour. */
const DEFAULT_ACCENT = '#334155';

/**
 * The school's colour, dark enough to read as text on white.
 *
 * A school may pick a bright yellow for its portal, where it lands on buttons
 * with white text of its own. Here it has to work as ink, so it is walked
 * darker until it clears the 4.5:1 that docs/16 §6 makes binding — rather than
 * printing a heading nobody can read, or silently refusing the school's colour.
 */
export function readableAccent(hex: string | undefined): string {
  const rgb = parseHex(hex);
  if (rgb === undefined) {
    return DEFAULT_ACCENT;
  }

  let [r, g, b] = rgb;
  // Bounded: each pass removes 15% of the remaining light, so twenty passes
  // reach effectively black long before the loop could run away.
  for (let pass = 0; pass < 20 && contrastWithWhite([r, g, b]) < 4.5; pass += 1) {
    r = Math.trunc(r * 0.85);
    g = Math.trunc(g * 0.85);
    b = Math.trunc(b * 0.85);
  }

  return toHex([r, g, b]);
}

/** The accent laid over white at `percent` opacity, as a flat hex. */
function mixWithWhite(hex: string, percent: number): string {
  const rgb = parseHex(hex);
  if (rgb === undefined) {
    return '#ffffff';
  }

  // Integer arithmetic throughout: ADR-0007 bans `Math.round` outright, so that
  // no rounding decision anywhere can quietly be applied to money.
  const over = (channel: number): number =>
    Math.trunc((channel * percent + 255 * (100 - percent)) / 100);

  return toHex([over(rgb[0]), over(rgb[1]), over(rgb[2])]);
}

/** A tuple, not an array: every consumer here wants exactly three channels. */
type Rgb = readonly [number, number, number];

function parseHex(hex: string | undefined): Rgb | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (match?.[1] === undefined) {
    return undefined;
  }
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('')}`;
}

function clamp(channel: number): number {
  return channel < 0 ? 0 : channel > 255 ? 255 : channel;
}

/** WCAG contrast against white, which is what this is printed on. */
function contrastWithWhite([r, g, b]: Rgb): number {
  const linear = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return 1.05 / (luminance + 0.05);
}
