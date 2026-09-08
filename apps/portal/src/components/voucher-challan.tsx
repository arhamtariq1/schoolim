'use client';

import { type VoucherDetail } from '@ilm/contracts';
import { Money } from '@ilm/ui';

/**
 * The printed challan — three copies on one A4.
 *
 * ## Why three
 *
 * School, bank, parent. It is what Pakistani banks accept at the counter, and a
 * single-copy challan is one a cashier hands back (docs/modules §6).
 *
 * ## Two figures, deliberately
 *
 * "Payable within due date" and "payable after due date" are separate boxes,
 * because they are separate amounts and the surcharge only applies to one of
 * them. Printing a single total is how a parent who paid on time is asked for a
 * late fee.
 *
 * ## No payment-channel block
 *
 * The reference challan carries a bank list and an aggregator id. Those belong
 * to one school's arrangements, so they are not hard-coded here — CLAUDE.md R1.
 * They arrive when the school can configure them, and until then the space goes
 * to the signature line a counter actually needs.
 */

export interface ChallanProps {
  voucher: VoucherDetail;
  school: { name: string; address?: string | undefined; phone?: string | undefined };
}

const COPIES = ['School copy', 'Bank copy', 'Parent copy'] as const;

export function VoucherChallan({ voucher, school }: ChallanProps) {
  return (
    <div className="voucher-challan grid gap-3 sm:grid-cols-3">
      {COPIES.map((copy) => (
        <ChallanCopy key={copy} copy={copy} voucher={voucher} school={school} />
      ))}
    </div>
  );
}

function ChallanCopy({ copy, voucher, school }: ChallanProps & { copy: (typeof COPIES)[number] }) {
  const charges = voucher.lines.filter((line) => line.kind === 'FEE');
  const afterDue = voucher.totalPayableMinor + voucher.lateFeeMinor;

  return (
    <article className="flex break-inside-avoid flex-col rounded-lg border border-border bg-card p-3 text-[11px] leading-snug text-foreground">
      <header className="border-b border-border pb-2">
        <p className="text-right text-[10px] font-medium text-muted-foreground">{copy}</p>
        <h3 className="text-center text-sm font-semibold uppercase">{school.name}</h3>
        {school.address === undefined ? null : (
          <p className="text-center text-[10px] text-muted-foreground">{school.address}</p>
        )}
        {school.phone === undefined ? null : (
          <p className="text-center text-[10px] text-muted-foreground">Phone {school.phone}</p>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 border-b border-border py-2">
        <Pair label="Issue date" value={formatDate(voucher.issueDate)} />
        <Pair label="Due date" value={formatDate(voucher.dueDate)} />
        <Pair label="GR No" value={voucher.grNo ?? '—'} />
        <Pair label="Session" value={voucher.sessionName} />
        <Pair label="Student" value={voucher.studentName} />
        <Pair label="Father" value={voucher.fatherName ?? '—'} />
        <Pair label="Class" value={voucher.className ?? '—'} />
        <Pair label="Section" value={voucher.sectionName ?? '—'} />
        <Pair label="Voucher" value={voucher.voucherNo} />
        <Pair
          label="Months"
          value={
            voucher.billMonths.length === 0
              ? '—'
              : voucher.billMonths.map((month) => formatMonth(month)).join(', ')
          }
        />
      </dl>

      <table className="w-full py-2">
        <caption className="sr-only">Charges on this voucher</caption>
        <tbody>
          {charges.map((line) => (
            <tr key={line.id}>
              <td className="py-0.5 pr-2">{line.label}</td>
              <td className="w-20 border border-border px-1.5 py-0.5 text-right font-mono tabular-nums">
                <Money valueMinor={line.amountMinor - line.discountMinor} withSymbol={false} />
              </td>
            </tr>
          ))}
          {/* No discount row. Each fee line above is already the discounted
              figure a parent owes, so printing "−1,500" underneath a total that
              does not move looks like an arithmetic mistake on the school's
              own challan. What was agreed privately with one family is also not
              something to put on a document that crosses a bank counter. */}
          {voucher.waiverMinor > 0 ? (
            <tr className="text-muted-foreground">
              <td className="py-0.5 pr-2">Waived</td>
              <td className="w-20 border border-border px-1.5 py-0.5 text-right font-mono tabular-nums">
                −<Money valueMinor={voucher.waiverMinor} withSymbol={false} />
              </td>
            </tr>
          ) : null}
          <tr>
            <td className="py-0.5 pr-2">
              Arrears
              {voucher.arrears.length === 0
                ? ''
                : ` (${voucher.arrears.map((entry) => entry.sourceVoucherNo).join(', ')})`}
            </td>
            <td className="w-20 border border-border px-1.5 py-0.5 text-right font-mono tabular-nums">
              <Money valueMinor={voucher.arrearsMinor} withSymbol={false} />
            </td>
          </tr>
        </tbody>
      </table>

      <dl className="space-y-1 border-t border-border pt-2">
        <Total label="Payable within due date" minor={voucher.totalPayableMinor} strong />
        {/* Printed even when it equals the figure above: a parent who sees only
            one number cannot tell whether paying late costs more. */}
        <Total label="Payable after due date" minor={afterDue} />
      </dl>

      <p className="mt-2 rounded border border-border px-2 py-1 text-center text-[10px]">
        This challan is valid till {formatDate(voucher.validTill)}
      </p>

      <div className="mt-auto pt-6">
        <p className="border-t border-border pt-1 text-center text-[10px] text-muted-foreground">
          Receiver&rsquo;s signature and stamp
        </p>
      </div>
    </article>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function Total({ label, minor, strong }: { label: string; minor: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className={strong === true ? 'font-medium' : 'text-muted-foreground'}>{label}</dt>
      <dd
        className={`w-20 border border-border px-1.5 py-0.5 text-right font-mono tabular-nums ${
          strong === true ? 'font-semibold' : ''
        }`}
      >
        <Money valueMinor={minor} withSymbol={false} />
      </dd>
    </div>
  );
}

/** `2026-09-01` → `01-09-2026`, which is how a Pakistani challan reads. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day ?? ''}-${month ?? ''}-${year ?? ''}`;
}

function formatMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}
