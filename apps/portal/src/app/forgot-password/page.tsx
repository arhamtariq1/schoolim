import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { AuthLayout } from '@/components/auth-layout';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export const metadata: Metadata = {
  title: `Forgot password — ${BRAND.name}`,
};

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter the email on your account and we will send a reset code."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
