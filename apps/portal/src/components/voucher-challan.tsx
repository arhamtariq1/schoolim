'use client';

import {
  kuickpayConsumerNo,
  onelinkConsumerNo,
  ROUTES,
  type Challan,
  type VoucherSettings,
} from '@ilm/contracts';
import { Money } from '@ilm/ui';

/**
 * The printed fee challan — three copies on one A4.
 *
 * ## Why three
 *
 * School, bank, parent. It is what Pakistani banks accept at the counter, and a
 * single-copy challan is one a cashier hands back (docs/modules §6). The names
 * on them are a school's own, because some say "Student Copy" and some say
 * "Parent Copy" and neither is ours to decide.
 *
 * ## Why it is a ruled document and not a grid of boxes
 *
 * The first cut drew a box around every figure. Three copies across A4 leaves
 * each one about 90mm wide, and a box wide enough to hold "15,900.00" does not
 * fit beside a label like "Amount payable within due date" — so the amounts
 * overflowed their borders and the whole thing read as congested.
 *
 * A challan is a ledger, so it is set as one: a single amount **column**, ruled,
 * right-aligned, the same width down the page. One column cannot overflow the
 * way twelve independent boxes can, the eye reads straight down it, and the
 * space it costs is taken once rather than per row.
 *
 * Everything else follows from the same constraint — a counter clerk reading
 * this upside down, at speed, under a fluorescent light:
 *
 * - **Four bands, in order.** Which copy this is, whose school it is, whose
 *   child it is, what is owed. Each is separated by a rule, so the eye can jump
 *   to one without reading the others.
 * - **Labels are small caps, values are bold.** The label is scenery; the value
 *   is what is being read. Making them the same weight is what made the old
 *   particulars block look mixed up.
 * - **One figure is the biggest thing on the page** — the amount payable within
 *   the due date. That is the number this document exists to communicate.
 * - **Flat black on white.** Background tints do not survive a photocopier, so
 *   nothing here depends on a fill to be legible.
 *
 * ## Two figures, deliberately
 *
 * "Payable within due date" and "payable after due date" are separate rows,
 * because they are separate amounts and the surcharge applies only to one of
 * them. Printing a single total is how a parent who paid on time is charged a
 * late fee.
 *
 * ## The payment block
 *
 * A school with a Kuickpay arrangement prints a consumer number and the network
 * a parent can pay at; a single campus with a bank slip prints neither, and the
 * space goes back to the signature line a counter actually needs. Which of those
 * happens is `VoucherSettings` — CLAUDE.md R1, on the one page of this product
 * that crosses a bank counter.
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
  };
  settings: VoucherSettings;
}

export function VoucherChallan({ voucher, school, settings }: ChallanProps) {
  return (
    <div className="voucher-challan grid gap-2 sm:grid-cols-3">
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

  return (
    <article className="challan-copy flex break-inside-avoid flex-col border border-black bg-white text-[9px] leading-snug text-black">
      {/* Which copy this is, on its own line. It used to sit in the corner of
          the letterhead, where it read as part of the school's name. */}
      <p className="border-b border-black py-[3px] text-center text-[8px] font-bold tracking-[0.18em] uppercase">
        {copy}
      </p>

      <header className="flex items-center gap-2 border-b border-black px-2 py-1.5">
        {showLogo ? (
          // A plain `img`: this is printed, so there is nothing for Next's
          // image pipeline to optimise, and a `next/image` here would be a
          // layout-shifting placeholder on a page whose only job is to be
          // laid out once and sent to a printer.
          <img
            src={`${ROUTES.schoolLogo.image}?v=${school.logoVersion ?? ''}`}
            alt=""
            className="size-10 shrink-0 object-contain"
          />
        ) : null}

        <div className="min-w-0 flex-1 text-center">
          <h3 className="text-[12px] leading-tight font-bold tracking-tight uppercase">
            {school.name}
          </h3>
          {school.address === undefined ? null : (
            <p className="mt-0.5 text-[8px] leading-tight">{school.address}</p>
          )}
          {school.phone === undefined ? null : (
            <p className="text-[8px] leading-tight">Ph: {school.phone}</p>
          )}
        </div>

        {/* Balances the logo, so the letterhead stays optically centred whether
            or not the school has uploaded one. */}
        {showLogo ? <span className="size-10 shrink-0" aria-hidden="true" /> : null}
      </header>

      {/* The names get the full width and are allowed to wrap. Half a copy is
          about 40mm, and "Muhammad Abdul Rahman Siddiqui" does not fit in it —
          a challan that truncates the child's name is one the office cannot
          match to a record. */}
      <dl className="grid grid-cols-[4.2rem_minmax(0,1fr)] gap-x-1 gap-y-[3px] border-b border-black px-2 py-1.5">
        <Row label="Student" value={voucher.studentName} wrap />
        <Row label="Father" value={voucher.fatherName ?? '—'} wrap />
      </dl>

      {/* Everything short, in two columns. Each is its own label/value grid, so
          every value in a column starts on the same x however long its label. */}
      <div className="grid grid-cols-2 divide-x divide-black border-b border-black">
        <dl className="grid grid-cols-[3.4rem_minmax(0,1fr)] gap-x-1 gap-y-[3px] px-2 py-1.5">
          <Row label="GR No" value={voucher.grNo ?? '—'} />
          <Row label="Class" value={voucher.className ?? '—'} />
          <Row label="Section" value={voucher.sectionName ?? '—'} />
          <Row label="Session" value={voucher.sessionName} />
        </dl>

        <dl className="grid grid-cols-[3.4rem_minmax(0,1fr)] gap-x-1 gap-y-[3px] px-2 py-1.5">
          {/* The challan's own number. Without it a school taking a payment at
              the counter has nothing to reconcile it against. */}
          <Row label="Voucher" value={voucher.voucherNo} />
          <Row label="Issued" value={formatDate(voucher.issueDate)} />
          <Row label="Due" value={formatDate(voucher.dueDate)} />
          <Row label="Valid till" value={formatDate(voucher.validTill)} />
        </dl>
      </div>

      {/* One amount column, ruled. `table-fixed` is what holds it to the same
          width on every row — and what stops a long fee name from squeezing the
          figure until it wraps. */}
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col />
          <col className="w-[38%]" />
        </colgroup>

        <thead>
          <tr className="border-b border-black">
            <th className="px-2 py-[3px] text-left text-[8px] font-semibold tracking-wide uppercase">
              Particulars
            </th>
            <th className="px-2 py-[3px] text-right text-[8px] font-semibold tracking-wide uppercase">
              Amount (Rs.)
            </th>
          </tr>
        </thead>

        <tbody>
          {charges.map((line) => (
            <Charge
              key={line.id}
              label={line.label}
              // Each fee line is already the discounted figure a parent owes.
              // No separate discount row: printing "−1,500" under a total that
              // does not move looks like an arithmetic mistake on the school's
              // own challan, and what was agreed privately with one family is
              // not for a document that crosses a bank counter.
              minor={line.amountMinor - line.discountMinor}
            />
          ))}

          {voucher.waiverMinor > 0 ? (
            <Charge label="Waived" minor={-voucher.waiverMinor} />
          ) : null}

          <Charge
            label="Arrears"
            hint={
              voucher.arrears.length === 0
                ? undefined
                : voucher.arrears.map((entry) => entry.sourceVoucherNo).join(', ')
            }
            minor={voucher.arrearsMinor}
          />
        </tbody>

        <tfoot>
          {/* The one figure this document exists to communicate, set as such. */}
          <tr className="border-t-2 border-black">
            <th className="px-2 py-1 text-left text-[9px] font-bold tracking-wide uppercase">
              Payable within due date
            </th>
            <td className="px-2 py-1 text-right font-mono text-[12px] font-bold tabular-nums">
              <Money valueMinor={voucher.totalPayableMinor} withSymbol={false} />
            </td>
          </tr>
          {/* Printed even when it equals the figure above: a parent who sees
              only one number cannot tell whether paying late costs more. */}
          <tr className="border-t border-black">
            <th className="px-2 py-[3px] text-left text-[8px] font-semibold">
              Payable after {formatDate(voucher.dueDate)}
            </th>
            <td className="px-2 py-[3px] text-right font-mono text-[10px] font-semibold tabular-nums">
              <Money valueMinor={afterDue} withSymbol={false} />
            </td>
          </tr>
        </tfoot>
      </table>

      {settings.footerNote === null ? null : (
        <p className="border-t border-black px-2 py-1 text-[7.5px] leading-snug">
          {settings.footerNote}
        </p>
      )}

      {/* Pushed to the bottom so every copy signs on the same line, whatever
          number of fee rows each carries. */}
      <div className="mt-auto px-2 pt-7 pb-1">
        <p className="border-t border-black pt-0.5 text-center text-[8px]">
          Receiver&rsquo;s Signature &amp; Stamp
        </p>
      </div>

      {kuickpay === undefined ? null : (
        <PaymentBlock kuickpay={kuickpay} onelink={onelink} channels={settings.kuickpayChannels} />
      )}
    </article>
  );
}

/**
 * The strip a parent actually uses to pay.
 *
 * Kept visually distinct from the challan above it — a filled bar and a boxed
 * number — because at a counter this is the only part anybody looks at, and it
 * has to be findable on a folded, photocopied sheet.
 *
 * ## Nothing legible depends on the fill
 *
 * The bar is the one place on this document that uses a tint, and a tint is the
 * one thing that may not survive: a printer with background graphics off, or a
 * photocopier, drops it. So the consumer number sits in a **white** box with
 * black digits and a black border — the same either way — and only the word
 * "Kuickpay" is white on black. If the fill vanishes that word goes with it and
 * no information is lost, because the line underneath already says what the
 * number is for. `globals.css` asks for the fill with `print-color-adjust`; this
 * is what makes the challan correct when the request is refused.
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
    <div className="border-t border-black">
      <div className="challan-paybar flex items-center justify-between gap-2 bg-black px-2 py-1 text-white">
        <span className="text-[11px] font-bold tracking-tight">Kuickpay</span>
        <span className="flex items-center gap-1 border border-black bg-white px-1 py-0.5 text-black">
          <span className="text-[8px] font-normal">ID</span>
          <span className="font-mono text-[10px] font-bold tracking-wider">{kuickpay}</span>
        </span>
      </div>

      {channels.length === 0 ? null : (
        <div className="px-2 py-1">
          <p className="text-[7.5px] font-semibold">Pay in cash using the Kuickpay ID at:</p>
          {/* Three columns, because twelve names down one side is a strip
              taller than the challan it belongs to. */}
          <ul className="mt-0.5 grid grid-cols-3 gap-x-2 text-[7px] leading-snug">
            {channels.map((channel) => (
              <li key={channel} className="truncate">
                • {channel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onelink === undefined ? null : (
        <p className="border-t border-black px-2 py-0.5 text-center text-[8px] font-semibold">
          1LINK ID: <span className="font-mono tracking-wider">{onelink}</span>
        </p>
      )}
    </div>
  );
}

/**
 * One particular of the child, as a label/value pair.
 *
 * The two cells are siblings in the parent's grid rather than a nested flex
 * row, which is what makes every value in a column start on the same x however
 * long its label is. A label that sets its own width is what made the old
 * block look like it had been shaken.
 */
function Row({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <>
      <dt className="text-[7.5px] tracking-wide uppercase">{label}</dt>
      {/* Short values truncate rather than reflow the grid; a name wraps,
          because cutting one off is worse than an extra line. */}
      <dd className={`font-bold ${wrap ? 'break-words' : 'truncate'}`}>{value}</dd>
    </>
  );
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
    <tr className="border-b border-black/25 last:border-b-0">
      <td className="truncate px-2 py-[3px]">
        {label}
        {hint === undefined ? null : <span className="ms-1 text-[8px]">({hint})</span>}
      </td>
      <td className="px-2 py-[3px] text-right font-mono tabular-nums">
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
