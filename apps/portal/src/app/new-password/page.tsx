import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';

import { AuthLayout } from '@/components/auth-layout';
import { authScreenLayout } from '@/components/auth-screen-props';
import { NewPasswordForm } from '@/components/new-password-form';

export const metadata: Metadata = {
  title: `New password — ${BRAND.name}`,
};

export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const emailRaw = query['email'];
  const tokenRaw = query['token'];
  const email = typeof emailRaw === 'string' ? emailRaw : undefined;
  const token = typeof tokenRaw === 'string' ? tokenRaw : undefined;

  return (
    <AuthLayout
      {...authScreenLayout}
      fitViewport
      title="Set a new password"
      subtitle="Choose a password you have not used on another site."
    >
      <NewPasswordForm email={email} token={token} />
    </AuthLayout>
  );
}
