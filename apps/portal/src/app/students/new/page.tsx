import {
  ROUTES,
  type AdmissionSetup,
  type FeeHead,
  type GrNumberSettings,
} from '@ilm/contracts';
import { DEFAULT_TIMEZONE, systemClock, today } from '@ilm/utils';
import type { Metadata } from 'next';

import { AdmissionForm } from '@/components/admission-form';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { apiFetch } from '@/lib/api';
import { pageIntro } from '@/lib/page-copy';
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
  const [session, admission, fees, grNumber] = await Promise.all([
    getSession(),
    // Its own read, not `/academics/setup`: that one narrows the classes to the
    // ones the caller teaches, and somebody allowed to add students must be able
    // to choose any class and section.
    apiFetch<{ data: AdmissionSetup }>(ROUTES.academics.admissionSetup),
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
    apiFetch<{ data: GrNumberSettings }>(ROUTES.school.grNumber),
  ]);

  const setup = admission.ok
    ? admission.data.data
    : { session: null, sessions: [], classes: [] };

  // Only the years a child can actually be placed into — the API already leaves
  // out a closed session, whose register is finished and where enrolling a
  // student would add them to a year the school has already reported on.
  const enrollableSessions = setup.sessions.map((entry) => ({
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
      <WorkspacePageHeader title="New admission" description={pageIntro('/students/new')} />

      <AdmissionForm
        today={today(systemClock, session?.school.timezone ?? DEFAULT_TIMEZONE)}
        sessionId={setup.session?.id ?? null}
        sessions={enrollableSessions}
        classes={setup.classes}
        catalogue={catalogue}
        canSetFees={session?.permissions.includes('fees.discount.create') ?? false}
        // A failed read is not "not configured": the server refuses the admission
        // itself, so the form only blocks on a definite answer.
        grConfigured={!grNumber.ok || grNumber.data.data.configured}
        canConfigureGr={session?.permissions.includes('settings.school.configure') ?? false}
      />
    </div>
  );
}
