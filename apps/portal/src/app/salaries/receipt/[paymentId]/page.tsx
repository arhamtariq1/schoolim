import { ROUTES, SALARY_PAYMENT_METHOD_LABELS, STAFF_ROLE_LABELS, type StaffSalaryReceipt } from '@ilm/contracts';
import { EmptyState, Money } from '@ilm/ui';
import { minorUnits } from '@ilm/utils';
import { notFound, redirect } from 'next/navigation';

import { ReceiptPrintButton } from '@/components/receipt-print-button';
import { salaryMonthLabel } from '@/components/salary-ui';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';

/**
 * A salary payment receipt.
 *
 * Outside the app shell, like the challan print view: a sheet of paper has no
 * sidebar. The figures are read from the server record, never recomputed here.
 */
export default async function SalaryReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('staff.salary.read')) {
    redirect('/');
  }

  const { paymentId } = await params;
  const result = await apiFetch<{ data: StaffSalaryReceipt }>(ROUTES.staffSalaries.receipt(paymentId));
  if (!result.ok && result.status === 404) {
    notFound();
  }
  if (!result.ok) {
    return <EmptyState title="That did not load" description={result.message} />;
  }
  const receipt = result.data.data;

  const rows: [string, string | undefined][] = [
    ['Staff', receipt.staff.name],
    ['Staff ID', receipt.staff.employeeNo],
    ['Role', STAFF_ROLE_LABELS[receipt.staff.role]],
    ['Salary month', salaryMonthLabel(receipt.month)],
    ['Payment date', receipt.paidOn],
    ['Method', SALARY_PAYMENT_METHOD_LABELS[receipt.method]],
    ['Reference', receipt.reference ?? undefined],
    ['Recorded by', receipt.recordedByName ?? undefined],
    ['Notes', receipt.notes ?? undefined],
  ];

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 print:py-0">
      <article className="rounded-xl border border-border bg-card p-6 text-foreground print:border-0 print:p-0">
        <header className="border-b border-border pb-4 text-center">
          <h1 className="text-xl font-semibold">{receipt.schoolName}</h1>
          <p className="text-sm text-muted-foreground">Salary payment receipt</p>
          <p className="mt-2 text-xs text-muted-foreground">Receipt no. {receipt.receiptNo}</p>
        </header>

        <dl className="divide-y divide-border text-sm">
          {rows
            .filter((row): row is [string, string] => row[1] !== undefined && row[1] !== '')
            .map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-6 py-2.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-end font-medium">{value}</dd>
              </div>
            ))}
        </dl>

        <footer className="mt-2 space-y-1 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Amount paid</span>
            <span className="text-lg font-semibold tabular-nums">
              <Money valueMinor={minorUnits(receipt.amountMinor)} withSymbol />
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Remaining for the month</span>
            <span className="font-medium tabular-nums">
              <Money valueMinor={minorUnits(receipt.remainingAfterMinor)} withSymbol dashOnZero />
            </span>
          </div>
        </footer>
      </article>

      <div className="mt-4 flex justify-center print:hidden">
        <ReceiptPrintButton />
      </div>
    </main>
  );
}
