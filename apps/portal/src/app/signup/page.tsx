import { TRIAL_DAYS } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { AuthLayout } from '@/components/auth-layout';
import { authScreenLayout } from '@/components/auth-screen-props';
import { SignupCredentialsForm } from '@/components/signup-credentials-form';

export const metadata: Metadata = {
  title: `Set up your school — ${BRAND.name}`,
  description: `Create your school and start a ${TRIAL_DAYS}-day free trial.`,
};

export default function SignupPage() {
  return (
    <AuthLayout
      {...authScreenLayout}
      title="Create your account"
      subtitle="Create your account in minutes."
      fitViewport
    >
      <SignupCredentialsForm />
    </AuthLayout>
  );
}
