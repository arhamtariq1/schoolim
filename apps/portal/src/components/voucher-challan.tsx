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
 * ## Why it is built from boxes rather than a table
 *
 * A counter clerk reads this upside down, at speed, under a fluorescent light,
 * and a bank's scanner reads the amount out of a ruled box. So every figure
 * sits in its own bordered cell, labels are left and amounts are right, and the
 * whole thing is drawn in flat black on white. This is the one screen in the
 * product where the design constraint is a photocopier: background tints do not
 * survive one, so nothing here depends on a fill to be legible.
 *
 * ## Two figures, deliberately
 *
 * "Payable within due date" and "payable after due date" are separate boxes,
 * because they are separate amounts and the surcharge applies only to one of
 * them. Printing a single total is how a parent who paid on time is charged a
 * late fee.
 *
 * ## The payment block
 *
 * A school with a Kuickpay arrangement prints a consumer number and the network
 * a parent can pay at; a single campus with a bank slip prints neither, and the
 * space goes back to the signature line a counter actually needs. Which of
 * those happens is `VoucherSettings` — CLAUDE.md R1, on the one page of this
 * product that crosses a bank counter.
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

function ChallanCopy({
  copy,
  voucher,
  school,
  settings,
}: ChallanProps & { copy: string }) {
  const charges = voucher.lines.filter((line) => line.kind === 'FEE');
  const afterDue = voucher.totalPayableMinor + voucher.lateFeeMinor;

  const kuickpay = kuickpayConsumerNo(settings, voucher.grNo);
  const onelink = onelinkConsumerNo(settings, voucher.grNo);
  const showLogo = settings.showLogo && school.logoVersion !== undefined;

  return (
    <article className="challan-copy flex break-inside-avoid flex-col border border-black bg-white text-[10px] leading-tight text-black">
      <header className="flex items-start gap-2 border-b border-black p-2">
        {showLogo ? (
          // A plain `img`: this is printed, so there is nothing for Next's
          // image pipeline to optimise, and a `next/image` here would be a
          // layout-shifting placeholder on a page whose only job is to be
          // laid out once and sent to a printer.
          <img
            src={`${ROUTES.schoolLogo.image}?v=${school.logoVersion ?? ''}`}
            alt=""
            className="h-12 w-12 shrink-0 object-contain"
          />
        ) : null}

        <div className="min-w-0 flex-1 text-center">
          <p className="text-right text-[9px] font-semibold">{copy}</p>
          <h3 className="text-[13px] leading-tight font-bold tracking-tight uppercase">
            {school.name}
          </h3>
          {school.address === undefined ? null : <p className="text-[9px]">{school.address}</p>}
          {school.phone === undefined ? null : (
            <p className="text-[9px] font-semibold">Phone No. {school.phone}</p>
          )}
        </div>
      </header>

      <div className="flex justify-between gap-2 border-b border-black px-2 py-1">
        <Field label="Issue Date" value={formatDate(voucher.issueDate)} />
        <Field label="Due Date" value={formatDate(voucher.dueDate)} />
      </div>

      <dl className="border-b border-black px-2 py-1">
        <div className="flex justify-between gap-2">
          <Field label="GR No" value={voucher.grNo ?? '—'} wide />
          <Field label="Session" value={voucher.sessionName} />
        </div>
        <Field label="Student's Name" value={voucher.studentName} wide />
        <Field label="Father's Name" value={voucher.fatherName ?? '—'} wide />
        <div className="flex justify-between gap-2">
          <Field label="Class" value={voucher.className ?? '—'} wide />
          <Field label="Sec" value={voucher.sectionName ?? '—'} />
        </div>
      </dl>

      {/* Every charge in its own ruled row, because that is how the amount is
          read — and how it is checked against what was paid. */}
      <div className="border-b border-black">
        {charges.map((line) => (
          <AmountRow
            key={line.id}
            label={line.label}
            minor={line.amountMinor - line.discountMinor}
          />
        ))}

        {/* No discount row. Each fee line above is already the discounted
            figure a parent owes, so printing "−1,500" underneath a total that
            does not move looks like an arithmetic mistake on the school's own
            challan. What was agreed privately with one family is also not
            something to put on a document that crosses a bank counter. */}
        {voucher.waiverMinor > 0 ? (
          <AmountRow label="Waived" minor={-voucher.waiverMinor} />
        ) : null}

        <AmountRow
          label="Arrears"
          hint={
            voucher.arrears.length === 0
              ? undefined
              : voucher.arrears.map((entry) => entry.sourceVoucherNo).join(', ')
          }
          minor={voucher.arrearsMinor}
        />
      </div>

      <div className="border-b border-black">
        <AmountRow label="Amount payable within due date" minor={voucher.totalPayableMinor} strong />
        {/* Printed even when it equals the figure above: a parent who sees only
            one number cannot tell whether paying late costs more. */}
        <AmountRow label="Amount payable after due date" minor={afterDue} strong />
      </div>

      <p className="border-b border-black px-2 py-1 text-center text-[9px] font-semibold">
        This challan is valid till {formatDate(voucher.validTill)}
      </p>

      {settings.footerNote === null ? null : (
        <p className="border-b border-black px-2 py-1 text-[8px]">{settings.footerNote}</p>
      )}

      {/* Pushed to the bottom so every copy signs on the same line, whatever
          number of fee rows each carries. */}
      <div className="mt-auto px-2 pt-6 pb-1">
        <p className="border-t border-black pt-0.5 text-center text-[9px]">
          Receiver&rsquo;s Signature &amp; Stamp
        </p>
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
          <p className="text-[8px] font-semibold">Pay in cash using the Kuickpay ID at:</p>
          {/* Three columns, because twelve names down one side is a strip
              taller than the challan it belongs to. */}
          <ul className="mt-0.5 grid grid-cols-3 gap-x-2 text-[7.5px] leading-snug">
            {channels.map((channel) => (
              <li key={channel} className="truncate">
                • {channel}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onelink === undefined ? null : (
        <p className="border-t border-black px-2 py-0.5 text-center text-[9px] font-semibold">
          1LINK ID: <span className="font-mono tracking-wider">{onelink}</span>
        </p>
      )}
    </div>
  );
}

/** `Label : value`, the way a challan sets out a field. */
function Field({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`flex gap-1 ${wide ? 'min-w-0 flex-1' : 'shrink-0'}`}>
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 truncate font-bold">
        <span className="me-1 font-normal">:</span>
        {value}
      </dd>
    </div>
  );
}

/** A charge and its boxed amount, which is the unit a counter clerk reads. */
function AmountRow({
  label,
  hint,
  minor,
  strong = false,
}: {
  label: string;
  hint?: string | undefined;
  minor: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-0.5">
      <span className={`min-w-0 truncate ${strong ? 'font-semibold' : ''}`}>
        {label}
        {hint === undefined ? null : <span className="ms-1 font-normal">({hint})</span>}
      </span>
      <span
        className={`w-16 shrink-0 border px-1 py-0.5 text-right font-mono tabular-nums ${
          strong ? 'border-black font-bold' : 'border-dashed border-black/60'
        }`}
      >
        <Money valueMinor={minor} withSymbol={false} />
      </span>
    </div>
  );
}

/** `2026-09-01` → `01-09-2026`, which is how a Pakistani challan reads. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day ?? ''}-${month ?? ''}-${year ?? ''}`;
}
