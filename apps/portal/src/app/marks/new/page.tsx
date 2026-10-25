import { ROUTES } from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';

import { MarksEntryForm } from '@/components/marks-entry-form';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'New assessment' };

export default async function NewAssessmentPage() {
  // Subjects and assessment types are not fetched here: they belong to the
  // class, so the form loads them when a class is chosen.
  const [session, classes] = await Promise.all([
    getSession(),
    apiFetch<{ data: { id: string; name: string }[] }>(ROUTES.students.classOptions),
  ]);

  // Hidden, not disabled (docs/16 §7): somebody who cannot enter marks is told
  // so rather than shown a form that always fails.
  if (!(session?.permissions.includes('exams.mark.create') ?? false)) {
    return (
      <EmptyState
        title="You can't enter marks"
        description="Marks are entered by the teacher of each class."
      />
    );
  }

  return (
    <MarksEntryForm
      classes={classes.ok ? classes.data.data : []}
      canEdit
      canManageSetup={session?.permissions.includes('exams.setup.manage') ?? false}
      today={systemClock.now().toISOString().slice(0, 10)}
    />
  );
}
