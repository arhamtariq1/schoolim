import { ROUTES, type StaffSalaryDetail } from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import { systemClock } from '@ilm/utils';
import { notFound, redirect } from 'next/navigation';

import { StaffSalaryPanel } from '@/components/staff-salary-panel';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { requireSchoolSession } from '@/lib/require-session';

/** One person's salary: who they are, what they are owed, and every payment. */
export default async function SalaryDetailPage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('staff.salary.read')) {
    redirect('/');
  }

  const { staffId } = await params;
  const result = await apiFetch<{ data: StaffSalaryDetail }>(ROUTES.staff.salary(staffId));
  if (!result.ok && result.status === 404) {
    notFound();
  }
  if (!result.ok) {
    return <EmptyState title="That did not load" description={result.message} />;
  }

  const detail = result.data.data;

  return (
    <div className="w-full space-y-6">
      <WorkspacePageHeader title="Salary Details" />
      <StaffSalaryPanel
        staffId={staffId}
        staffName={detail.staff.name}
        canPay={session.permissions.includes('staff.salary.pay')}
        today={systemClock.now().toISOString().slice(0, 10)}
        showStaffInfo
        initial={detail}
      />
    </div>
  );
}
