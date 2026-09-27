import { ROUTES, type InviteCheckResult } from '@ilm/contracts';
import { BRAND } from '@ilm/utils';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AcceptInviteForm } from '@/components/accept-invite-form';
import { AuthLayout } from '@/components/auth-layout';
import { apiFetch } from '@/lib/api';

export const metadata: Metadata = { title: `Set your password — ${BRAND.name}` };

/**
 * Where a staff invitation lands.
 *
 * The token is read **on the server** before anything is rendered, for two
 * reasons. A dead link gets a page that says so, rather than a password form
 * that fails after somebody has typed into it twice. And a live one gets the
 * person's name and their school on it, so a link followed three days later is
 * recognisable rather than being a bare box asking for a password.
 *
 * Checking is not spending: this call reads the invitation and leaves it
 * unaccepted, so opening the page twice, or having a mail client prefetch the
 * URL, costs nothing.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params['t'] ?? params['token'];
  const token = typeof raw === 'string' ? raw : '';

  const result =
    token === ''
      ? undefined
      : await apiFetch<{ data: InviteCheckResult }>(ROUTES.auth.inviteCheck, {
          method: 'POST',
          body: JSON.stringify({ token }),
        });

  if (result === undefined || !result.ok) {
    return (
      <AuthLayout
        title="This invitation has expired"
        subtitle="Invitation links work once and last three days."
      >
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Ask whoever added you at the school to send another one. If you have already set a
            password, you can sign in instead.
          </p>
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const invite = result.data.data;

  return (
    <AuthLayout
      title={`Welcome, ${invite.name.split(' ')[0] ?? invite.name}`}
      subtitle={`${invite.schoolName} has added you as ${invite.roleLabel.toLowerCase()}. Choose a password to finish setting up your account.`}
    >
      <AcceptInviteForm token={token} email={invite.email} />
    </AuthLayout>
  );
}
