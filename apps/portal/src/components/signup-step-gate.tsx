'use client';

import { ROUTES, type SignupStatus } from '@ilm/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

const SIGNUP_CONTEXT = 'signup-verification';

/**
 * Keeps the three signup URLs honest against the httpOnly `ilm_su` cookie.
 *
 * Deep-linking mid-flow without a session (or with the wrong step) sends the
 * person to the step the API says they are on — never past an unverified email.
 */
export function SignupStepGate({
  expect,
  children,
}: {
  readonly expect: SignupStatus['step'];
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(ROUTES.public.signupStatus, {
          credentials: 'include',
        });

        if (!response.ok) {
          if (!cancelled) {
            router.replace('/signup');
          }
          return;
        }

        const body = (await response.json()) as { data: SignupStatus };
        if (cancelled) {
          return;
        }

        if (body.data.step !== expect) {
          router.replace(
            body.data.step === 'otp'
              ? `/otp-verification?context=${SIGNUP_CONTEXT}&email=${encodeURIComponent(body.data.email)}`
              : `/signup/school?email=${encodeURIComponent(body.data.email)}`,
          );
          return;
        }

        setReady(true);
      } catch {
        if (!cancelled) {
          router.replace('/signup');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expect, router]);

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Checking your signup…
      </p>
    );
  }

  return children;
}

export { SIGNUP_CONTEXT };
