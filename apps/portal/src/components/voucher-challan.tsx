'use client';

import {
  kuickpayConsumerNo,
  onelinkConsumerNo,
  ROUTES,
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
    /** The same, for the bank's mark at the foot. */
    bankLogoVersion?: string | undefined;
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

/**
 * Dotted cut lines between copies: a vertical rule after every copy but the
 * last in the three-across layout, and a cross (right of the left column,
 * below the top row) in the 2x2 layout.
 */
function separators(copyCount: number, index: number): string {
  if (copyCount === 4) {
    return `${index % 2 === 0 ? 'border-e-2' : ''} ${index < 2 ? 'border-b-2' : ''}`;
  }
  return index < copyCount - 1 ? 'border-e-2' : '';
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
  const theme = COPY_THEMES[copyIndex] ?? COPY_THEMES[3]!;
  const showBank = settings.bankName !== null || school.bankLogoVersion !== undefined;
  const kuickpay = kuickpayConsumerNo(settings, voucher.grNo);
  const onelink = onelinkConsumerNo(settings, voucher.grNo);
  const pad = preview ? 'px-2' : 'px-2.5';

  return (
    <article
      className={`challan-copy relative flex h-full break-inside-avoid flex-col justify-between overflow-hidden border-dotted border-neutral-400 bg-white py-3 leading-snug ${separators(settings.copyCount, copyIndex)} text-neutral-900 ${
        preview ? 'text-[8.5px]' : 'text-[9.5px]'
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
        {/* Logo + copy badge */}
        <div className={`flex items-center justify-between gap-2 pt-2 ${pad}`}>
          <ChallanMark
            showSchoolLogo={settings.showLogo && school.logoVersion !== undefined}
            logoVersion={school.logoVersion}
            preview={preview}
          />
          <span
            className={`shrink-0 font-semibold tracking-wide text-neutral-700 uppercase ${
              preview ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            {copy}
          </span>
        </div>

        {/* School identity + challan meta */}
        <div className={`mt-2 flex items-start justify-between gap-2 border-b border-neutral-200 pb-3 ${pad}`}>
          <div className="min-w-0 flex-1">
            <h3
              className={`font-bold tracking-tight text-balance text-neutral-900 ${
                preview ? 'text-[11px] leading-tight' : 'text-[13px] leading-snug'
              }`}
            >
              {school.name}
            </h3>
            {school.address === undefined ? null : (
              <p
                className={`mt-0.5 text-neutral-500 ${preview ? 'text-[8px] leading-snug' : 'text-[8.5px] leading-snug'}`}
              >
                {school.address}
              </p>
            )}
            {school.phone === undefined ? null : (
              <p className={`text-neutral-500 ${preview ? 'text-[8px]' : 'text-[8.5px]'}`}>
                {school.phone}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-neutral-500 ${preview ? 'text-[8px]' : 'text-[8px]'}`}>Challan No.</p>
            <p
              className={`font-bold tabular-nums text-neutral-900 ${
                preview ? 'text-[9px]' : 'text-[11px]'
              }`}
            >
              {voucher.voucherNo}
            </p>
            <p className={`mt-0.5 text-neutral-500 ${preview ? 'text-[8px]' : 'text-[8px]'}`}>
              {formatBillMonth(voucher.billMonths[0] ?? voucher.issueDate)}
            </p>
          </div>
        </div>
      </div>

      {/* Student details — compact two-column card, never stretched */}
      <div className={`mt-3 shrink-0 border-b border-neutral-200 pb-3 ${pad}`}>
        <dl className="flex flex-col gap-2">
          <DetailRow label="Student Name" value={voucher.studentName} preview={preview} />
          <DetailRow label="Father Name" value={voucher.fatherName ?? '—'} preview={preview} />
          <DetailRow label="GR No" value={voucher.grNo ?? '—'} preview={preview} />
          <DetailRow label="Class" value={voucher.className ?? '—'} preview={preview} />
          <DetailRow label="Section" value={voucher.sectionName ?? '—'} preview={preview} />
          <DetailRow label="Session" value={voucher.sessionName} preview={preview} />
        </dl>
      </div>

      {/* Particulars */}
      <div className={`mt-3 shrink-0 ${pad}`}>
      <table className="w-full table-fixed border-collapse overflow-hidden rounded-t-lg">
        <thead>
          <tr className="bg-neutral-100">
            <th
              className={`py-2 text-left font-semibold text-neutral-700 ${pad} ${
                preview ? 'text-[8px]' : 'text-[9px]'
              }`}
            >
              Particulars
            </th>
            <th
              className={`py-2 text-right font-semibold text-neutral-700 ${pad} ${
                preview ? 'text-[8px]' : 'text-[9px]'
              }`}
            >
              Amount (Rs.)
            </th>
          </tr>
        </thead>
        <tbody>
          {charges.map((line) => (
            <tr key={line.id} className="border-t border-neutral-200">
              <td className={`truncate py-2 ${pad} ${preview ? 'text-[8px]' : 'text-[9px]'}`}>
                {line.label}
              </td>
              <td
                className={`py-2 text-right font-medium tabular-nums ${pad} ${
                  preview ? 'text-[8px]' : 'text-[9px]'
                }`}
              >
                <Money valueMinor={line.amountMinor - line.discountMinor} withSymbol={false} />
              </td>
            </tr>
          ))}
          {voucher.waiverMinor > 0 ? (
            <tr className="border-t border-neutral-200">
              <td className={`py-2 ${pad}`}>Waived</td>
              <td className={`py-2 text-right tabular-nums ${pad}`}>
                <Money valueMinor={-voucher.waiverMinor} withSymbol={false} />
              </td>
            </tr>
          ) : null}
          <tr className="border-t border-neutral-200">
            <td className={`py-2 ${pad} ${preview ? 'text-[8px]' : 'text-[9px]'}`}>
              Arrears
              {voucher.arrears.length === 0 ? null : (
                <span className="ms-1 text-neutral-500">
                  ({voucher.arrears.map((entry) => entry.sourceVoucherNo).join(', ')})
                </span>
              )}
            </td>
            <td
              className={`py-2 text-right font-medium tabular-nums ${pad} ${
                preview ? 'text-[8px]' : 'text-[9px]'
              }`}
            >
              <Money valueMinor={voucher.arrearsMinor} withSymbol={false} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* Total — tinted bar, dark ink (survives mono print as a grey band) */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 rounded-b-lg px-2.5 py-3"
        style={{ backgroundColor: theme.wash, color: theme.ink }}
      >
        <span className={`font-bold ${preview ? 'text-[10px]' : 'text-[11px]'}`}>Total Payable</span>
        <span className={`font-bold tabular-nums ${preview ? 'text-[13px]' : 'text-[15px]'}`}>
          <Money valueMinor={voucher.totalPayableMinor} withSymbol={false} />
        </span>
      </div>

      </div>
      {/* Bank + late-fee note */}
      {showBank || settings.footerNote !== null ? (
        <div className={`mt-3 shrink-0 ${pad}`}>
          <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
            <BankGlyph />
            <div className="min-w-0 flex-1">
              {settings.bankName === null ? null : (
                <p
                  className={`font-semibold text-neutral-900 ${preview ? 'text-[8px]' : 'text-[9px]'}`}
                >
                  {settings.bankName}
                </p>
              )}
              {school.bankLogoVersion === undefined ? null : (
                <img
                  src={`${ROUTES.bankLogo.image}?v=${school.bankLogoVersion}`}
                  alt=""
                  role="presentation"
                  className={`mt-1 w-auto object-contain ${preview ? 'h-4 max-w-12' : 'h-5 max-w-16'}`}
                />
              )}
              {settings.footerNote === null ? null : (
                <p className={`mt-0.5 text-neutral-500 ${preview ? 'text-[8px]' : 'text-[8px]'}`}>
                  {settings.footerNote}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Dates */}
      <div className={`mt-3 grid shrink-0 grid-cols-3 gap-1 border-b border-neutral-200 pb-3 ${pad}`}>
        <DateCell label="Issue Date" value={formatDate(voucher.issueDate)} preview={preview} />
        <DateCell label="Due Date" value={formatDate(voucher.dueDate)} preview={preview} />
        <DateCell label="Valid Till" value={formatDate(voucher.validTill)} preview={preview} />
      </div>

      {kuickpay === undefined ? null : (
        <div className="shrink-0">
          <PaymentBlock kuickpay={kuickpay} onelink={onelink} channels={settings.kuickpayChannels} />
        </div>
      )}

      {/* Signatures — pinned to the foot of the copy */}
      <div className={`mt-auto flex shrink-0 justify-between gap-3 pt-8 pb-2 ${pad}`}>
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
        className={`${size} object-contain object-left`}
      />
    );
  }

  return (
    <img
      src="/auth/lemma-logo.png"
      alt={BRAND.name}
      className={`${size} object-contain object-left`}
    />
  );
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
    <div className="flex items-baseline gap-3">
      <dt className={`w-20 shrink-0 text-neutral-600 ${preview ? 'text-[8px]' : 'text-[9px]'}`}>
        {label}
      </dt>
      <dd
        className={`min-w-0 font-semibold break-words text-neutral-900 ${preview ? 'text-[9px]' : 'text-[10px]'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function DateCell({
  label,
  value,
  preview,
}: {
  label: string;
  value: string;
  preview: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className={`text-neutral-500 ${preview ? 'text-[8px]' : 'text-[8px]'}`}>{label}</p>
      <p className={`font-semibold tabular-nums text-neutral-900 ${preview ? 'text-[8px]' : 'text-[9px]'}`}>
        {value}
      </p>
    </div>
  );
}

function BankGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 size-4 shrink-0 text-neutral-500"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
    </svg>
  );
}

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
    <div className="mt-2 border-t border-neutral-200 px-3 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold tracking-tight text-[var(--challan-accent)]">
          Kuickpay
        </span>
        <span className="flex items-center gap-1.5 rounded border border-neutral-400 bg-white px-2 py-0.5 text-black">
          <span className="text-[8px] tracking-wide text-neutral-500 uppercase">ID</span>
          <span className="font-mono text-[11px] font-bold tracking-wider">{kuickpay}</span>
        </span>
      </div>
      {channels.length === 0 ? null : (
        <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-px text-[8px] text-neutral-600">
          {channels.map((channel) => (
            <li key={channel} className="truncate">
              {channel}
            </li>
          ))}
        </ul>
      )}
      {onelink === undefined ? null : (
        <p className="mt-1 text-center text-[9px]">
          <span className="text-neutral-500">1LINK ID</span>{' '}
          <span className="font-mono font-semibold tracking-wider">{onelink}</span>
        </p>
      )}
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
