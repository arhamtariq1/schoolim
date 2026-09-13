import { TRIAL_DAYS } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthLayout } from '@/components/auth-layout';
import { SignupForm } from '@/components/signup-form';

/**
 * Create a school — ADR-0010.
 *
 * Apex only; `src/proxy.ts` redirects this to `/` on a school's own hostname,
 * because someone already inside their portal has no use for a form that makes
 * them a second one.
 *
 * It shares the split frame with signing in, so arriving from one to the other
 * does not feel like landing on a different product — and because the panel
 * beside it is doing real work here: this is the screen where somebody decides
 * whether to type their school's name into a stranger's form.
 */
export const metadata: Metadata = {
  title: `Set up your school — ${BRAND.name}`,
  description: `Create your school and start a ${TRIAL_DAYS}-day free trial.`,
};

export default function SignupPage() {
  return (
    <AuthLayout
      title="Set up your school"
      subtitle={`Two minutes, and you are inside. ${String(TRIAL_DAYS)} days free — no card, no sales call.`}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
