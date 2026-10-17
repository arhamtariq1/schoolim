'use client';

import {
  ROUTES,
  type BankLogo,
  type Challan,
  type VoucherSettings,
} from '@ilm/contracts';
import { Money } from '@ilm/ui';
import { BRAND } from '@ilm/utils';
import { type CSSProperties } from 'react';

/**
 * The printed fee challan.
 *
 * ## Three copies across, or four in a square
 *
 * Landscape three-up or portrait 2×2. Each copy is the same document in the
 * school's words — only the badge and the tint of the total row change, so a
 * clerk can tell which slip is which after the sheet is cut.
 *
 * ## Why the fills are light tints, never reverse type
 *
 * A printer with "background graphics" off drops fills. Every tint here carries
 * **dark text on a pale wash**, so the challan stays correct in flat black on
 * white. The copy colour is ink and border, not white-on-solid.
 *
 * ## Platform mark when the school has none
 *
 * A challan without a mark looks unfinished. When `showLogo` is on and the
 * school has not uploaded one, the platform wordmark prints instead — the same
 * fallback the sidebar uses before setup.
 */

/** Per-copy theme: School / Bank / Student / (fourth). Pale wash + readable ink. */
const NEUTRAL_THEME = { ink: '#171717', wash: '#f5f5f5', badge: '#fafafa' } as const;
const COPY_THEMES = [NEUTRAL_THEME, NEUTRAL_THEME, NEUTRAL_THEME, NEUTRAL_THEME] as const;

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
    /** Every filled bank-logo slot, in print order — printed in one row at the foot. */
    bankLogos?: readonly BankLogo[] | undefined;
    /** The school's brand colour, `#rrggbb`. Absent means the default ink. */
    accentColor?: string | undefined;
  };
  settings: VoucherSettings;
  /**
   * Settings-screen preview only — denser type and non-selectable text. Printed
   * challans keep their paper sizes.
   */
  preview?: boolean | undefined;
}

export function VoucherChallan({ voucher, school, settings, preview = false }: ChallanProps) {
  const accent = readableAccent(school.accentColor);

  return (
    <div
      className={`voucher-challan grid h-full gap-1.5 ${
        // 3 copies → landscape A4, three across. 4 copies → portrait A4, 2×2.
        // min-height matches the printable area (A4 minus 8mm margins) so print
        // and dialog previews stretch even when the parent has no explicit height.
        settings.copyCount === 4
          ? 'challan-portrait grid-cols-2 grid-rows-2 min-h-[281mm]'
          : 'grid-cols-3 grid-rows-1 min-h-[194mm]'
      }${preview ? ' select-none' : ''}`}
      style={
        {
          '--challan-accent': accent,
          '--challan-rule': mixWithWhite(accent, 30),
        } as CSSProperties
      }
    >
      {settings.copyLabels.map((copy, index) => (
        <ChallanCopy
          // Labels are a school's own text and two of them can be identical.
          // The index is the only stable identity a copy has.
          key={`${copy}-${String(index)}`}
          copy={copy}
          copyIndex={index}
          voucher={voucher}
          school={school}
          settings={settings}
          preview={preview}
        />
      ))}
    </div>
  );
}

function ChallanCopy({
  copy,
  copyIndex,
  voucher,
  school,
  settings,
  preview = false,
}: ChallanProps & { copy: string; copyIndex: number }) {
  const charges = voucher.lines.filter((line) => line.kind === 'FEE');
  const theme = COPY_THEMES[copyIndex] ?? COPY_THEMES[3];
  // Four copies share a portrait sheet, so each gets half the height: the same
  // layout in the denser type, with tighter spacing and smaller marks.
  const tight = settings.copyCount === 4;
  const dense = preview || tight;
  const pad = dense ? 'px-2' : 'px-2.5';
  const gap = tight ? 'mt-1.5' : 'mt-3';
  const rowPad = tight ? 'py-1' : 'py-2';
  const bankLogos = (settings.showBankLogos ? (school.bankLogos ?? []) : []).map(
    (logo) => `${ROUTES.bankLogo.slot(logo.slot)}?v=${logo.version}`,
  );

  return (
    <article
      className={`challan-copy relative flex h-full break-inside-avoid flex-col justify-between overflow-hidden border border-dashed border-neutral-400 bg-white ${tight ? 'py-1.5' : 'py-3'} leading-snug text-neutral-900 ${
        dense ? 'text-[8.5px]' : 'text-[9.5px]'
      }`}
      style={
        {
          '--challan-accent': theme.ink,
          '--challan-wash': theme.wash,
          '--challan-badge': theme.badge,
        } as CSSProperties
      }
    >
      <div className="shrink-0">
        {/* Centred school identity: logo, name, address, contact */}
        <div className={`flex flex-col items-center gap-1 border-b border-neutral-200 ${tight ? 'pt-1 pb-1.5' : 'pt-2 pb-3'} text-center ${pad}`}>
          <ChallanMark
            showSchoolLogo={settings.showLogo && school.logoVersion !== undefined}
            logoVersion={school.logoVersion}
            preview={dense}
          />
          <div className="min-w-0">
            <h3
              className={`font-bold tracking-tight text-balance text-neutral-900 ${
                dense ? 'text-[11px] leading-tight' : 'text-[13px] leading-snug'
              }`}
            >
              {school.name}
            </h3>
            {school.address === undefined ? null : (
              <p
                className={`mt-0.5 text-neutral-500 ${dense ? 'text-[8px] leading-snug' : 'text-[8.5px] leading-snug'}`}
              >
                {school.address}
              </p>
            )}
            {school.phone === undefined ? null : (
              <p className={`text-neutral-500 ${dense ? 'text-[8px]' : 'text-[8.5px]'}`}>
                {school.phone}
              </p>
            )}
          </div>
        </div>

        {/* Copy label + challan meta, below the header */}
        <div className={`flex items-center justify-between gap-2 border-b border-neutral-200 ${rowPad} ${pad}`}>
          <span
            className={`shrink-0 font-semibold tracking-wide text-neutral-700 uppercase ${
              dense ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            {copy}
          </span>
          <div className="flex items-baseline gap-2 text-right">
            <span className={`text-neutral-500 ${dense ? 'text-[8px]' : 'text-[8px]'}`}>Challan No.</span>
            <span
              className={`font-bold tabular-nums text-neutral-900 ${
                dense ? 'text-[9px]' : 'text-[11px]'
              }`}
            >
              {voucher.voucherNo}
            </span>
            <span className={`text-neutral-500 ${dense ? 'text-[8px]' : 'text-[8px]'}`}>
              · {formatBillMonth(voucher.billMonths[0] ?? voucher.issueDate)}
            </span>
          </div>
        </div>
      </div>

      {/* Student details + dates — two columns so the copy's full width is used */}
      <div className={`${gap} shrink-0 border-b border-neutral-200 ${tight ? 'pb-1.5' : 'pb-3'} ${pad}`}>
        <dl className={`grid grid-cols-2 gap-x-3 ${tight ? 'gap-y-1' : 'gap-y-2'}`}>
          <DetailRow label="Student Name" value={voucher.studentName} preview={dense} />
          <DetailRow label="Father Name" value={voucher.fatherName ?? '—'} preview={dense} />
          {settings.showStudentDetails ? (
            <>
              <DetailRow label="GR No" value={voucher.grNo ?? '—'} preview={dense} />
              <DetailRow label="Class" value={voucher.className ?? '—'} preview={dense} />
              <DetailRow label="Section" value={voucher.sectionName ?? '—'} preview={dense} />
              <DetailRow label="Session" value={voucher.sessionName} preview={dense} />
            </>
          ) : null}
          {settings.showDates ? (
            <>
              <DetailRow label="Issue Date" value={formatDate(voucher.issueDate)} preview={dense} />
              <DetailRow label="Due Date" value={formatDate(voucher.dueDate)} preview={dense} />
            </>
          ) : null}
        </dl>
      </div>

      {/* Particulars */}
      <div className={`${gap} shrink-0 ${pad}`}>
      <table className="w-full table-fixed border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              className={`rounded-s-lg bg-neutral-100 ${rowPad} text-left font-semibold text-neutral-700 ${pad} ${
                dense ? 'text-[8px]' : 'text-[9px]'
              }`}
            >
              Particulars
            </th>
            <th
              className={`rounded-e-lg bg-neutral-100 ${rowPad} text-right font-semibold text-neutral-700 ${pad} ${
                dense ? 'text-[8px]' : 'text-[9px]'
              }`}
            >
              Amount (Rs.)
            </th>
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-neutral-200 [&_tr:first-child_td]:border-t-0">
          {charges.map((line) => (
            <tr key={line.id}>
              <td className={`truncate ${rowPad} ${pad} ${dense ? 'text-[8px]' : 'text-[9px]'}`}>
                {line.label}
              </td>
              <td
                className={`${rowPad} text-right font-medium tabular-nums ${pad} ${
                  dense ? 'text-[8px]' : 'text-[9px]'
                }`}
              >
                <Money valueMinor={line.amountMinor - line.discountMinor} withSymbol={false} />
              </td>
            </tr>
          ))}
          {voucher.waiverMinor > 0 ? (
            <tr>
              <td className={`${rowPad} ${pad}`}>Waived</td>
              <td className={`${rowPad} text-right tabular-nums ${pad}`}>
                <Money valueMinor={-voucher.waiverMinor} withSymbol={false} />
              </td>
            </tr>
          ) : null}
          <tr>
            <td className={`${rowPad} ${pad} ${dense ? 'text-[8px]' : 'text-[9px]'}`}>
              Arrears
              {voucher.arrears.length === 0 ? null : (
                <span className="ms-1 text-neutral-500">
                  ({voucher.arrears.map((entry) => entry.sourceVoucherNo).join(', ')})
                </span>
              )}
            </td>
            <td
              className={`${rowPad} text-right font-medium tabular-nums ${pad} ${
                dense ? 'text-[8px]' : 'text-[9px]'
              }`}
            >
              <Money valueMinor={voucher.arrearsMinor} withSymbol={false} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* After the due date — the surcharge frozen on this voucher, never re-rated */}
      {voucher.lateFeeMinor > 0 ? (
        <div className={`${tight ? 'my-1' : 'my-1.5'} flex flex-col gap-1 px-2.5`}>
          <div
            className={`flex items-center justify-between gap-2 text-neutral-600 ${
              dense ? 'text-[8px]' : 'text-[9px]'
            }`}
          >
            <span>Late fee after {formatDate(voucher.dueDate)}</span>
            <span className="font-medium tabular-nums">
              + <Money valueMinor={voucher.lateFeeMinor} withSymbol={false} />
            </span>
          </div>
          <div
            className={`flex items-center justify-between gap-2 font-semibold text-neutral-900 ${
              dense ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            <span>Payable after due date</span>
            <span className="tabular-nums">
              <Money
                valueMinor={voucher.totalPayableMinor + voucher.lateFeeMinor}
                withSymbol={false}
              />
            </span>
          </div>
        </div>
      ) : null}

      {/* Total — tinted bar, dark ink (survives mono print as a grey band) */}
      <div
        className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 ${tight ? 'py-1.5' : 'py-3'}`}
        style={{ backgroundColor: theme.wash, color: theme.ink }}
      >
        <span className={`font-bold ${dense ? 'text-[10px]' : 'text-[11px]'}`}>Total Payable</span>
        <span className={`font-bold tabular-nums ${dense ? 'text-[13px]' : 'text-[15px]'}`}>
          <Money valueMinor={voucher.totalPayableMinor} withSymbol={false} />
        </span>
      </div>

      </div>
      {/* Bank mark + footer note — the uploaded mark alone, no name and no box */}
      {bankLogos.length > 0 || settings.footerNote !== null ? (
        <div className={`${gap} flex shrink-0 flex-col items-start gap-1.5 text-left ${pad}`}>
          {bankLogos.length === 0 ? null : (
            // One row from the left, packed side by side in upload order; the
            // height steps down as marks are added, and each shrinks if the row overflows.
            <div className="flex w-full items-center justify-start gap-2">
              {bankLogos.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  role="presentation"
                  className={`w-auto min-w-0 shrink object-contain ${bankLogoHeight(bankLogos.length, tight)}`}
                />
              ))}
            </div>
          )}
          {settings.footerNote === null ? null : (
            <p className={`text-neutral-500 ${dense ? 'text-[8px]' : 'text-[8px]'}`}>
              {settings.footerNote}
            </p>
          )}
        </div>
      ) : null}

      {/* Signatures — pinned to the foot of the copy */}
      <div className={`mt-auto flex shrink-0 justify-between gap-3 ${tight ? 'pt-4 pb-1' : 'pt-8 pb-2'} ${pad}`}>
        <span className="flex-1 border-t border-dotted border-neutral-400 pt-1 text-[8px] text-neutral-600 last:text-right">
          Receiver&rsquo;s Signature
        </span>
        <span className="flex-1 border-t border-dotted border-neutral-400 pt-1 text-[8px] text-neutral-600 last:text-right">
          Student/Parent Signature
        </span>
      </div>
    </article>
  );
}

/**
 * School mark when one exists and printing is on; otherwise the platform
 * wordmark so the header is never blank.
 */
function ChallanMark({
  showSchoolLogo,
  logoVersion,
  preview,
}: {
  showSchoolLogo: boolean;
  logoVersion: string | undefined;
  preview: boolean;
}) {
  const size = preview ? 'h-8 max-w-28' : 'h-10 max-w-36';

  if (showSchoolLogo && logoVersion !== undefined) {
    return (
      <img
        src={`${ROUTES.schoolLogo.image}?v=${logoVersion}`}
        alt=""
        className={`${size} object-contain object-center`}
      />
    );
  }

  return (
    <img
      src="/auth/lemma-logo.png"
      alt={BRAND.name}
      className={`${size} object-contain object-center`}
    />
  );
}

/**
 * A lone mark prints large; each extra mark in the row steps the height down.
 * The four-copy sheet gives each copy half the height, so its marks start smaller.
 */
function bankLogoHeight(count: number, tight: boolean): string {
  if (tight) return count <= 2 ? 'h-9' : 'h-7';
  if (count <= 1) return 'h-16';
  if (count === 2) return 'h-12';
  if (count === 3) return 'h-10';
  return 'h-8';
}

function DetailRow({
  label,
  value,
  preview,
}: {
  label: string;
  value: string;
  preview: boolean;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className={`shrink-0 text-neutral-500 ${preview ? 'text-[8px]' : 'text-[8.5px]'}`}>
        {label}
      </dt>
      <dd
        className={`min-w-0 font-semibold tabular-nums break-words text-neutral-900 ${preview ? 'text-[9px]' : 'text-[10px]'}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** `2026-09-01` → `01-09-2026`, which is how a Pakistani challan reads. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day ?? ''}-${month ?? ''}-${year ?? ''}`;
}

/** `2026-10-01` → `Oct 2026` for the header month chip. */
function formatBillMonth(iso: string): string {
  const [year, month] = iso.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const index = Number(month) - 1;
  const label = index >= 0 && index < 12 ? months[index] : month;
  return `${label ?? ''} ${year ?? ''}`.trim();
}

/** The default ink, for a school that has not chosen a colour. */
const DEFAULT_ACCENT = '#334155';

/**
 * The school's colour, dark enough to read as text on white.
 *
 * A school may pick a bright yellow for its portal, where it lands on buttons
 * with white text of its own. Here it has to work as ink, so it is walked
 * darker until it clears the 4.5:1 that docs/16 §6 makes binding.
 */
export function readableAccent(hex: string | undefined): string {
  const rgb = parseHex(hex);
  if (rgb === undefined) {
    return DEFAULT_ACCENT;
  }

  let [r, g, b] = rgb;
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

  const over = (channel: number): number =>
    Math.trunc((channel * percent + 255 * (100 - percent)) / 100);

  return toHex([over(rgb[0]), over(rgb[1]), over(rgb[2])]);
}

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

function contrastWithWhite([r, g, b]: Rgb): number {
  const linear = (channel: number): number => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return 1.05 / (luminance + 0.05);
}
