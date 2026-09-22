import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { AuthLayout } from '@/components/auth-layout';
import { OtpVerificationForm, PASSWORD_RESET_CONTEXT } from '@/components/otp-verification-form';
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

  const isSignup = context === SIGNUP_CONTEXT || context === 'signup';
  const isPasswordReset = context === PASSWORD_RESET_CONTEXT;

  return (
    <AuthLayout
      title={isSignup ? 'Confirm your email' : 'Enter verification code'}
      subtitle={
        isSignup
          ? 'We sent a 6-digit code to your email. Enter it to continue setting up your school.'
          : isPasswordReset
            ? 'We sent a 6-digit code to your email. Enter it to choose a new password.'
            : 'We sent a 6-digit code to your email. It expires in a few minutes.'
      }
    >
      {isSignup ? (
        <SignupStepGate expect="otp">
          <OtpVerificationForm email={email} context={SIGNUP_CONTEXT} />
        </SignupStepGate>
      ) : (
        <OtpVerificationForm
          email={email}
          context={isPasswordReset ? PASSWORD_RESET_CONTEXT : context}
        />
      )}
    </AuthLayout>
  );
}
