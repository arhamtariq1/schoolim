import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthLayout } from '@/components/auth-layout';
import { OtpVerificationForm, PASSWORD_RESET_CONTEXT } from '@/components/otp-verification-form';
import { SignupBackLink } from '@/components/signup-abandon';
import { SIGNUP_CONTEXT, SignupStepGate } from '@/components/signup-step-gate';

export const metadata: Metadata = {
  title: `Verify code — ${BRAND.name}`,
};

export default async function OtpVerificationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const emailRaw = query['email'];
  const contextRaw = query['context'];
  const email = typeof emailRaw === 'string' ? emailRaw : undefined;
  const context = typeof contextRaw === 'string' ? contextRaw : undefined;

  const isPasswordReset = context === PASSWORD_RESET_CONTEXT;
  // Signup is the default OTP flow. Links that omit `context` still get Back.
  const isSignup = !isPasswordReset;

  return (
    <AuthLayout
      title="Enter verification code"
      subtitle={
        isPasswordReset
          ? 'We sent a 6-digit code to your email. Enter it to choose a new password.'
          : 'We sent a 6-digit code to your email. It expires in a few minutes.'
      }
      back={
        isPasswordReset ? (
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            ← Back
          </Link>
        ) : (
          <SignupBackLink />
        )
      }
    >
      {isSignup ? (
        <SignupStepGate expect="otp">
          <OtpVerificationForm email={email} context={SIGNUP_CONTEXT} />
        </SignupStepGate>
      ) : (
        <OtpVerificationForm email={email} context={PASSWORD_RESET_CONTEXT} />
      )}
    </AuthLayout>
  );
}
