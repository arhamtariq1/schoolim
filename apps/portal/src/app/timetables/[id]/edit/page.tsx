import { ROUTES, type TimetableDetail, type TimetableOptions } from '@ilm/contracts';
import { ErrorState } from '@ilm/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { TimetableForm } from '@/components/timetable-form';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Edit timetable' };

export default async function EditTimetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { add } = await searchParams;
  const session = await getSession();
  if (session?.permissions.includes('academics.timetable.configure') !== true) {
    notFound();
  }

  const [detail, options] = await Promise.all([
    apiFetch<{ data: TimetableDetail }>(ROUTES.timetables.detail(id)),
    apiFetch<{ data: TimetableOptions }>(ROUTES.timetables.options),
  ]);

  if (!detail.ok) {
    if (detail.status === 404 || detail.status === 400) {
      notFound();
    }
    return <ErrorState title="That timetable did not load" description={detail.message} />;
  }
  if (!options.ok) {
    return <ErrorState title="The form did not load" description={options.message} />;
  }

  return <TimetableForm key={id} options={options.data.data} editing={detail.data.data} addPeriod={add === '1'} />;
}
