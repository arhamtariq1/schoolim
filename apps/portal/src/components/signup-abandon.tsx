'use client';

import { ROUTES } from '@ilm/contracts';
import { BackIcon, ICON_SIZE } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { clearSignupDraft } from '@/lib/signup-draft';

/**
 * Leaves an in-progress signup and opens the credentials form.
 *
 * Must POST cancel first: a plain link to `/signup` leaves `ilm_su` in place,
 * and the credentials form immediately resumes the OTP step.
 *
 * `keepDraft` (Back) restores the previous name / email / password.
 * `keepDraft: false` (Start over) wipes the draft for a blank form.
 */
export function SignupAbandonControl({
  href = '/signup',
  keepDraft = true,
  children,
  className,
}: {
  readonly href?: string;
  readonly keepDraft?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function abandon() {
    if (pending) {
      return;
    }
    setPending(true);
    if (!keepDraft) {
      clearSignupDraft();
    }
    try {
      await fetch(ROUTES.public.signupCancel, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Still leave — a stuck cookie is worse than a failed cancel.
    }
    router.replace(href);
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        void abandon();
      }}
      className={className}
    >
      {children}
    </button>
  );
}

/** Visible Back control — keeps the credentials draft. */
export function SignupBackLink({ className }: { readonly className?: string }) {
  return (
    <SignupAbandonControl
      keepDraft
      className={
        className ??
        'inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50'
      }
    >
      <BackIcon className={ICON_SIZE.inline} aria-hidden="true" />
      Back
    </SignupAbandonControl>
  );
}
