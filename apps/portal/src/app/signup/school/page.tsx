import { TRIAL_DAYS } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { AuthLayout } from '@/components/auth-layout';
import { SchoolSetupForm } from '@/components/school-setup-form';
import { SignupStepGate } from '@/components/signup-step-gate';

export const metadata: Metadata = {
  title: `Your school — ${BRAND.name}`,
};

export default async function SignupSchoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const raw = query['email'];
  const email = typeof raw === 'string' ? raw : undefined;

  return (
    <AuthLayout
      title="Set up your school"
      width="wide"
      subtitle={`Two minutes, and you are inside. ${String(TRIAL_DAYS)} days free — no card, no sales call.`}
    >
      <SignupStepGate expect="school">
        <SchoolSetupForm ownerEmail={email} />
      </SignupStepGate>
    </AuthLayout>
  );
}
