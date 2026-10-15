import {
  ROUTES,
  type AssessmentListItem,
  type AssessmentTypeItem,
  type SubjectItem,
} from '@ilm/contracts';
import type { Metadata } from 'next';

import { MarksListView } from '@/components/marks-list-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

/** Marks — every test and exam the caller is allowed to see. */
export const metadata: Metadata = { title: 'Marks' };

export default async function MarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string): string => {
    const value = params[key];
    return typeof value === 'string' ? value : '';
  };
  const filters = {
    classLevelId: pick('classLevelId'),
    subjectId: pick('subjectId'),
    assessmentTypeId: pick('assessmentTypeId'),
  };

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '') {
      query.set(key, value);
    }
  }

  const [session, list, classes, subjects, types] = await Promise.all([
    getSession(),
    apiFetch<{ data: AssessmentListItem[] }>(`${ROUTES.marks.assessments}?${query.toString()}`),
    apiFetch<{ data: { id: string; name: string }[] }>(ROUTES.students.classOptions),
    apiFetch<{ data: SubjectItem[] }>(ROUTES.marks.subjects),
    apiFetch<{ data: AssessmentTypeItem[] }>(ROUTES.marks.assessmentTypes),
  ]);

  return (
    <MarksListView
      items={list.ok ? list.data.data : []}
      classes={classes.ok ? classes.data.data : []}
      subjects={subjects.ok ? subjects.data.data : []}
      types={types.ok ? types.data.data : []}
      filters={filters}
      can={{
        enter: session?.permissions.includes('exams.mark.create') ?? false,
        setup: session?.permissions.includes('exams.setup.manage') ?? false,
      }}
      error={list.ok ? undefined : list.message}
    />
  );
}
