import { schoolSlugFromHost } from '@ilm/utils';
import { headers } from 'next/headers';
import Link from 'next/link';

import { AuthLayout } from '@/components/auth-layout';
import { LoginForm } from '@/components/login-form';

/**
 * Sign in.
 *
 * **There is no school picker, and there is no longer a school field either.**
 *
 * The previous version of this page had two states: on a school's hostname it
 * showed the form, and on the apex it asked the person to type their school's
 * short name, because the API had no way to find their account without one.
 * That second state was a real cost — it asked for something most people do not
 * know, in order to satisfy a constraint of ours rather than a need of theirs.
 *
 * ADR-0009 removed it. The apex now resolves the school from the credentials
 * *after* verifying them, so both addresses ask for the same two things. What
 * did not change is the rule that made the school field exist in the first
 * place: nothing about which schools exist is disclosed before a correct
 * password. The list is not offered up front; it is derived from a password,
 * and only ever contains schools the person just proved they belong to.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [requestHeaders, query] = await Promise.all([headers(), searchParams]);
  const host = requestHeaders.get('host') ?? undefined;
  const appDomain = process.env['APP_DOMAIN'] ?? 'localhost';
  const slug = schoolSlugFromHost(host, appDomain);

  // Set by /auth/continue when a handoff token was expired, already used, or
  // for a different school. All four are one message: sign in again.
  const expired = query['expired'] !== undefined;
  const unreachable = query['unreachable'] !== undefined;
  // Set by the proxy when a session could not be renewed. Its own sentence:
  // "that link has expired" reads as a mistake when you did not follow a link.
  const sessionEnded = query['session'] === 'expired';
  const notice = unreachable
    ? 'Could not reach the server. Try signing in again.'
    : expired
      ? 'That sign-in link has expired. Sign in again.'
      : sessionEnded
        ? 'You were signed out. Sign in to pick up where you left off.'
        : undefined;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={slug === undefined ? 'Sign in to your school’s portal.' : `Sign in to ${slug}.`}
      notice={
        notice === undefined ? undefined : (
          <div
            role="status"
            className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
          >
            {notice}
          </div>
        )
      }
      footer={
        slug === undefined ? (
          <>
            New here?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Set up your school
            </Link>
          </>
        ) : undefined
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
