import { ROUTES, type AssessmentTypeItem, type SubjectItem } from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import type { Metadata } from 'next';

import { MarksSetupView } from '@/components/marks-setup-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Subjects & assessment types' };

export default async function MarksSetupPage() {
  const [session, subjects, types] = await Promise.all([
    getSession(),
    apiFetch<{ data: SubjectItem[] }>(ROUTES.marks.subjects),
    apiFetch<{ data: AssessmentTypeItem[] }>(ROUTES.marks.assessmentTypes),
  ]);

  if (!(session?.permissions.includes('exams.setup.manage') ?? false)) {
    return (
      <EmptyState
        title="You can't manage subjects"
        description="Ask the school office to change the subject or assessment lists."
      />
    );
  }

  return (
    <MarksSetupView
      subjects={subjects.ok ? subjects.data.data : []}
      types={types.ok ? types.data.data : []}
    />
  );
}
