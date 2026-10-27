import {
  ROUTES,
  type AcademicSession,
  type AssessmentListItem,
  type ClassLevel,
  type ClassMarksSummary,
  type StudentListItem,
} from '@ilm/contracts';
import { EmptyState } from '@ilm/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ClassDetailView } from '@/components/class-detail-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Class' };

/** The cap on the student table. A class of more than this is searched, not scrolled. */
const STUDENT_LIMIT = 200;

/**
 * One class — overview, students, subjects, assessment types and tests, on one page.
 *
 * `?sessionId=` follows the Classes page's session switcher, so a link from a
 * past year's list shows that year's class.
 *
 * Everything is fetched in parallel and each part degrades on its own: a
 * caller who may not read marks still gets the class and its students, with
 * the marks sections saying why they are empty.
 */
export default async function ClassDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const requested = typeof query['sessionId'] === 'string' ? query['sessionId'] : undefined;

  const session = await getSession();
  if (!(session?.permissions.includes('academics.structure.read') ?? false)) {
    return (
      <EmptyState
        title="You can't open this page"
        description="Class details are for the school office. Teachers see their classes under Attendance and Students."
      />
    );
  }

  const sessions = await apiFetch<{ data: AcademicSession[] }>(ROUTES.academics.sessions);
  const sessionList = sessions.ok ? sessions.data.data : [];
  const activeSession =
    sessionList.find((entry) => entry.id === requested) ??
    sessionList.find((entry) => entry.isCurrent) ??
    sessionList[0];

  const sessionParam =
    activeSession === undefined ? '' : `sessionId=${encodeURIComponent(activeSession.id)}`;
  const canReadMarks = session?.permissions.includes('exams.result.read') ?? false;

  const [classes, students, summary, assessments] = await Promise.all([
    apiFetch<{ data: ClassLevel[] }>(`${ROUTES.academics.classes}?${sessionParam}`),
    apiFetch<{ data: StudentListItem[]; meta: { page: { total: number } } }>(
      `${ROUTES.students.list}?classLevelId=${encodeURIComponent(id)}&limit=${String(STUDENT_LIMIT)}&sort=name&order=asc&${sessionParam}`,
    ),
    canReadMarks
      ? apiFetch<{ data: ClassMarksSummary }>(`${ROUTES.marks.classSummary(id)}?${sessionParam}`)
      : Promise.resolve(undefined),
    canReadMarks
      ? apiFetch<{ data: AssessmentListItem[] }>(
          `${ROUTES.marks.assessments}?classLevelId=${encodeURIComponent(id)}`,
        )
      : Promise.resolve(undefined),
  ]);

  const entry = classes.ok ? classes.data.data.find((row) => row.id === id) : undefined;
  if (classes.ok && entry === undefined) {
    notFound();
  }
  if (entry === undefined) {
    return (
      <EmptyState
        title="That did not load"
        description={classes.ok ? 'Class not found.' : classes.message}
      />
    );
  }

  return (
    <ClassDetailView
      entry={entry}
      sessionName={activeSession?.name}
      students={students.ok ? students.data.data : []}
      studentTotal={students.ok ? students.data.meta.page.total : 0}
      studentsError={students.ok ? undefined : students.message}
      summary={summary?.ok === true ? summary.data.data : undefined}
      assessments={assessments?.ok === true ? assessments.data.data : []}
      can={{
        marks: canReadMarks,
        // The same permission the API enforces; the buttons are hidden, not disabled.
        manage: session?.permissions.includes('exams.setup.manage') ?? false,
      }}
    />
  );
}
