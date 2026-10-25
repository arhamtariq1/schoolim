import { ROUTES, type AssessmentDetail } from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import { systemClock } from '@ilm/utils';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MarksEntryForm } from '@/components/marks-entry-form';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Marks' };

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session, result] = await Promise.all([
    getSession(),
    apiFetch<{ data: AssessmentDetail }>(ROUTES.marks.assessment(id)),
  ]);

  // A class that is not theirs answers 404, and so does this page.
  if (!result.ok && result.status === 404) {
    notFound();
  }
  if (!result.ok) {
    return <EmptyState title="That did not load" description={result.message} />;
  }

  return (
    <MarksEntryForm
      existing={result.data.data}
      classes={[]}
      canEdit={session?.permissions.includes('exams.mark.create') ?? false}
      canManageSetup={false}
      today={systemClock.now().toISOString().slice(0, 10)}
    />
  );
}
