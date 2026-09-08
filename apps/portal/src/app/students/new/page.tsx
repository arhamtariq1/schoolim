import { ROUTES, type ClassLevelWithSections, type FeeHead } from '@ilm/contracts';
import { BackIcon, ICON_SIZE } from '@ilm/ui/icons';
import { DEFAULT_TIMEZONE, systemClock, today } from '@ilm/utils';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AdmissionForm } from '@/components/admission-form';
import { AppShell } from '@/components/app-shell';
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
export const metadata: Metadata = { title: 'Admit a student' };

export default async function NewStudentPage() {
  const [session, academics, fees] = await Promise.all([
    getSession(),
    apiFetch<{ data: { session: { id: string } | null; classes: ClassLevelWithSections[] } }>(
      ROUTES.academics.setup,
    ),
    apiFetch<{ data: FeeHead[] }>(ROUTES.fees.heads),
  ]);

  const setup = academics.ok ? academics.data.data : { session: null, classes: [] };
  // Only what a school currently charges. A retired head must not reappear on
  // a new admission just because old students still carry it.
  const catalogue = fees.ok ? fees.data.data.filter((head) => head.isActive) : [];

  return (
    <AppShell
      user={{ name: session?.name ?? '', roleLabel: session?.roles.join(', ') ?? '' }}
      school={{ name: session?.school.name ?? '' }}
      permissions={session?.permissions ?? []}
      unverifiedEmail={session === undefined || session.emailVerified ? undefined : session.email}
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/students"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <BackIcon className={ICON_SIZE.inline} aria-hidden />
            Students
          </Link>
          <h1 className="mt-3 text-xl font-semibold text-foreground">Admit a student</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A GR number and a Student ID are issued automatically. Class, guardian and fees can all
            be changed later.
          </p>
        </div>

        <AdmissionForm
          // Computed here, in the school's own timezone, rather than in the
          // browser: a Karachi school admitting at 11pm must get today's
          // Karachi date, and the browser may be anywhere.
          today={today(systemClock, session?.school.timezone ?? DEFAULT_TIMEZONE)}
          sessionId={setup.session?.id ?? null}
          classes={setup.classes}
          catalogue={catalogue}
          canSetFees={session?.permissions.includes('fees.discount.create') ?? false}
        />
      </div>
    </AppShell>
  );
}
