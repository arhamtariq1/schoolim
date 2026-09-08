import { TRIAL_DAYS } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SignupForm } from '@/components/signup-form';

/**
 * Create a school — ADR-0010.
 *
 * Apex only; `src/proxy.ts` redirects this to `/` on a school's own hostname,
 * because someone already inside their portal has no use for a form that makes
 * them a second one.
 *
 * The form is `max-w-2xl` per docs/16 §5. A signup form that stretches to
 * 1,600px is unreadable, and this one is nine fields.
 */
export const metadata: Metadata = {
  title: `Set up your school — ${BRAND.name}`,
  description: `Create your school and start a ${TRIAL_DAYS}-day free trial.`,
};

export default function SignupPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {BRAND.name}
        </Link>
        <h1 className="mt-6 text-xl font-semibold text-foreground">Set up your school</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Two minutes, and you are inside. {TRIAL_DAYS} days free — no card, no sales call.
        </p>
      </div>

      <SignupForm />

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
