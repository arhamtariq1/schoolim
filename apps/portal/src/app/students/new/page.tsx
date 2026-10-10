import {
  ENROLLABLE_SESSION_STATUSES,
  ROUTES,
  type AcademicSession,
  type ClassLevelWithSections,
  type FeeHead,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, systemClock, today } from '@ilm/utils';
import type { Metadata } from 'next';

import { AdmissionForm } from '@/components/admission-form';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/**
 * Admission — its own page, not a dialog.
 *
 * It was a dialog, and admission had outgrown it well before fees arrived: a
 * modal cannot be linked to, cannot survive a refresh, traps focus around a
 * form long enough to need scrolling inside a scroll, and gives a receptionist
 * nowhere to put a half-finished admission while they phone a parent for a
 * CNIC. Four sections and a money total is a page (docs/16 §5: forms are
 * `max-w-2xl`; this one earns wider because the fee grid is tabular).
 *
 * Everything the form needs is fetched here, in parallel, so it opens with the
 * classes and the fee catalogue already in it rather than assembling itself in
 * front of the person filling it in.
 */
export const metadata: Metadata = { title: 'New admission' };

export default async function NewStudentPage() {
  const [session, academics, sessions, fees] = await Promise.all([
    getSession(),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevelWithSections[] } }>(
      ROUTES.academics.setup,
    ),
    apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions),
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
  ]);

  const setup = academics.ok ? academics.data.data : { session: null, classes: [] };

  // Only the years a child can actually be placed into. A closed session's
  // register is finished, and offering it would enrol a student into a year the
  // school has already reported on.
  const enrollableSessions = (sessions.ok ? sessions.data.data : [])
    .filter((entry) => ENROLLABLE_SESSION_STATUSES.includes(entry.status))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      status: entry.status,
      isCurrent: entry.isCurrent,
    }));
  // Only what a school currently charges. A retired head must not reappear on
  // a new admission just because old students still carry it.
  const catalogue = fees.ok ? fees.data.data.filter((head) => head.isActive) : [];

  return (
    <div className="w-full space-y-8">
      <WorkspacePageHeader
        title="New Admission"
        description="Enter student details to create a new admission record."
      />

      <AdmissionForm
        today={today(systemClock, session?.school.timezone ?? DEFAULT_TIMEZONE)}
        sessionId={setup.session?.id ?? null}
        sessions={enrollableSessions}
        classes={setup.classes}
        catalogue={catalogue}
        canSetFees={session?.permissions.includes('fees.discount.create') ?? false}
      />
    </div>
  );
}
