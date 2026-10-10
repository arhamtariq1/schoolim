import { ROUTES, type AcademicSession, type ClassLevel, type FeeHead } from '@ilm/contracts';
import type { Metadata } from 'next';

import { GenerateFee } from '@/components/generate-fee';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Fees › Generate.
 *
 * The screen itself is a client component because it is a live preview: the
 * totals follow the form, from the same endpoint that will do the writing. This
 * page's job is only to load the three lookups it needs, in parallel.
 */
export const metadata: Metadata = { title: 'Generate fee' };

export default async function GenerateFeePage() {
  const [session, academics, sessions, heads] = await Promise.all([
    getSession(),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevel[] } }>(
      ROUTES.academics.setup,
    ),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
  ]);

  const setup = academics.ok ? academics.data.data : { session: null, classes: [] };
  const failure = [academics, sessions, heads].find((result) => !result.ok);

  return (
    <GenerateFee
        sessions={sessions.ok ? sessions.data.data : []}
        classes={setup.classes}
        heads={heads.ok ? heads.data.data : []}
        currentSessionId={setup.session?.id}
        canGenerate={session?.permissions.includes('fees.voucher.generate') ?? false}
        schoolName={session?.school.name}
        error={failure === undefined || failure.ok ? undefined : failure.message}
      />
  );
}
