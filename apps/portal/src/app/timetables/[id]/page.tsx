import { ROUTES, type TimetableDetail } from '@ilm/contracts';
import { ErrorState } from '@ilm/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { TimetableDetailView } from '@/components/timetable-detail-view';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Timetable' };

/**
 * One timetable.
 *
 * A timetable that is not yours to see — a draft, or another class's — answers
 * 404 from the API, the same as one that does not exist, and so does this page.
 */
export default async function TimetablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const canManage = session?.permissions.includes('academics.timetable.configure') ?? false;

  const detail = await apiFetch<{ data: TimetableDetail }>(ROUTES.timetables.detail(id));

  if (!detail.ok) {
    if (detail.status === 404 || detail.status === 400) {
      notFound();
    }
    return <ErrorState title="That timetable did not load" description={detail.message} />;
  }

  return <TimetableDetailView timetable={detail.data.data} canManage={canManage} />;
}
