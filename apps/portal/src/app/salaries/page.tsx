import { systemClock } from '@ilm/utils';
import { redirect } from 'next/navigation';

import { SalariesView } from '@/components/salaries-view';
import { requireSchoolSession } from '@/lib/require-session';

/** Salaries — everybody's pay for a month. Admin, Principal and Office Staff. */
export default async function SalariesPage() {
  const session = await requireSchoolSession();
  if (!session.permissions.includes('staff.salary.read')) {
    redirect('/');
  }

  return (
    <SalariesView
      canPay={session.permissions.includes('staff.salary.pay')}
      today={systemClock.now().toISOString().slice(0, 10)}
    />
  );
}
