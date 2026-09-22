import { TRIAL_DAYS } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthLayout } from '@/components/auth-layout';
import { SignupCredentialsForm } from '@/components/signup-credentials-form';

export const metadata: Metadata = {
  title: `Set up your school — ${BRAND.name}`,
  description: `Create your school and start a ${TRIAL_DAYS}-day free trial.`,
};

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      subtitle={`Name, email and password first. Then we confirm your email and set up the school — ${String(TRIAL_DAYS)} days free.`}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupCredentialsForm />
    </AuthLayout>
  );
}
