import type { SessionUser } from '@ilm/contracts';
import { redirect } from 'next/navigation';

import { getSession } from './session';


/**
 * Session gate for authenticated school pages.
 *
 * Centralises the three redirects that used to be scattered (or missing):
 * signed-out → login, must-change-password → password, incomplete profile →
 * `/profile/create`. Callers that need the session for data pass
 * `allowIncompleteProfile` only on `/profile/create`.
 */
export async function requireSchoolSession(options?: {
  readonly allowIncompleteProfile?: boolean;
}): Promise<SessionUser> {
  const session = await getSession();

  if (session === undefined) {
    redirect('/login?session=expired');
  }

  if (session.mustChangePassword) {
    redirect('/settings/password');
  }

  if (!session.profileCompleted && options?.allowIncompleteProfile !== true) {
    redirect('/profile/create');
  }

  return session;
}
