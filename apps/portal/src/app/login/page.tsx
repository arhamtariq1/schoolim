import { BRAND, schoolSlugFromHost } from '@ilm/utils';
import { headers } from 'next/headers';

import { LoginForm } from '@/components/login-form';
import { NoSchoolInAddress } from '@/components/no-school-in-address';

/**
 * Sign in.
 *
 * **There is no school picker.** The school is resolved from the subdomain
 * (docs/09 §2) — a picker would hand the full list of tenants to anyone who
 * loaded this page.
 *
 * That gives this page two states, and the second one matters more than it
 * looks. Reaching the apex domain used to render the form anyway, which then
 * accepted a correct password and answered *"that email or password is not
 * correct"* — because the API had no school in which to look the account up.
 * The credentials were fine. Telling someone their password is wrong when it is
 * not costs an hour and a support call, so the address is checked here, before
 * the form is offered at all.
 */
export default async function LoginPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? undefined;
  const appDomain = process.env['APP_DOMAIN'] ?? 'localhost';
  const slug = schoolSlugFromHost(host, appDomain);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">{BRAND.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {slug === undefined ? 'Which school?' : `Sign in to ${slug}`}
          </p>
        </div>

        {slug === undefined ? <NoSchoolInAddress appDomain={appDomain} /> : <LoginForm />}
      </div>
    </main>
  );
}
