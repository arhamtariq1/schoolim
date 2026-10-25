import { ROUTES, type AcademicSession } from '@ilm/contracts';

import { PromoteStudents } from '@/components/promote-students';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Academics › Promote students — carrying the school into the next session.
 *
 * The sessions are fetched here; the preview is not. It depends on which two
 * sessions are chosen, which is a decision made on the screen, so fetching it
 * on the server would mean guessing the pair and refetching the moment somebody
 * disagreed with the guess.
 */
export default async function PromotePage() {
  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
  ]);

  return (
    <PromoteStudents
        sessions={result.ok ? result.data.data : []}
        error={result.ok ? undefined : result.message}
        canConfigure={session?.permissions.includes('academics.structure.configure') ?? false}
      />
  );
}
