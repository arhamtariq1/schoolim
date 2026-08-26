import { BRAND } from '@ilm/utils';
import { redirect } from 'next/navigation';

import { PlatformLoginForm } from '@/components/platform-login-form';
import { getPlatformSession } from '@/lib/api';

/**
 * Platform sign-in.
 *
 * No school, no subdomain, no "which school?" step — the console is not a
 * tenant. That is the whole difference between this page and the portal's, and
 * it is why the two apps are separate rather than one app with a flag.
 */
export default async function PlatformLoginPage() {
  if ((await getPlatformSession()) !== undefined) {
    redirect('/schools');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">{BRAND.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Platform console</p>
        </div>

        <PlatformLoginForm />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          This console reaches every school. Access is logged.
        </p>
      </div>
    </main>
  );
}
