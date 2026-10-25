import {
  ROUTES,
  type FeeHead,
  type StudentFeePaymentHistory,
  type StudentProfile,
} from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import { notFound } from 'next/navigation';

import { StudentProfileView } from '@/components/student-profile-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * One student, everything about them.
 *
 * The screen a school actually lives in: someone rings about a child, and the
 * person answering needs the class, the guardian's number and the history in
 * front of them without clicking anywhere.
 *
 * A 404 here is deliberately indistinguishable from "not permitted" — the API
 * answers the same way for both, because a 403 would confirm the record exists
 * (docs/11 §4).
 */
export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;

  if (session === undefined) {
    return <SignedOut />;
  }

  const canSetFees = session.permissions.includes('fees.discount.create');
  const canViewFeePayments = session.permissions.includes('fees.voucher.read');
  const canViewAttendance = session.permissions.includes('attendance.report.read');

  // The catalogue goes out with the profile rather than when the fee dialog
  // opens: it is the same short list for every student, and fetching it on a
  // click is a dialog that opens empty and fills in underneath the cursor.
  const [result, headsResult, feePaymentsResult] = await Promise.all([
    apiFetch<{ data: StudentProfile }>(ROUTES.students.profile(id)),
    canSetFees
      ? apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads)
      : Promise.resolve({ ok: false as const, status: 403, message: '' }),
    canViewFeePayments
      ? apiFetch<{ data: StudentFeePaymentHistory }>(ROUTES.students.feePayments(id))
      : Promise.resolve({ ok: false as const, status: 403, message: '' }),
  ]);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  const can = {
    update: session.permissions.includes('students.student.update'),
    guardians: session.permissions.includes('students.guardian.update'),
    fees: canSetFees,
  };

  return result.ok ? (
    <StudentProfileView
      student={result.data.data}
      heads={headsResult.ok ? headsResult.data.data : []}
      feePayments={feePaymentsResult.ok ? feePaymentsResult.data.data.entries : []}
      can={{
        ...can,
        feePayments: canViewFeePayments,
        attendance: canViewAttendance,
      }}
    />
  ) : (
    <EmptyState title="That did not load" description={result.message} />
  );
}

function SignedOut() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">
        Your session has ended.{' '}
        <a className="underline" href="/login">
          Sign in again
        </a>
        .
      </p>
    </main>
  );
}
