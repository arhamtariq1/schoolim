import { ROUTES, type TimetableDetail, type TimetableOptions } from '@ilm/contracts';
import { ErrorState } from '@ilm/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { TimetableForm } from '@/components/timetable-form';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'New timetable' };

/** Only the office makes timetables; for anyone else this page is not there. A copy parameter starts from another timetable. */
export default async function NewTimetablePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { copy } = await searchParams;
  const session = await getSession();
  if (session?.permissions.includes('academics.timetable.configure') !== true) {
    notFound();
  }

  const options = await apiFetch<{ data: TimetableOptions }>(ROUTES.timetables.options);
  if (!options.ok) {
    return <ErrorState title="The form did not load" description={options.message} />;
  }

  // "Duplicate" arrives with the timetable to copy; one that cannot be read is simply a blank form.
  const source =
    typeof copy === 'string' && copy !== ''
      ? await apiFetch<{ data: TimetableDetail }>(ROUTES.timetables.detail(copy))
      : undefined;

  return (
    <TimetableForm
      options={options.data.data}
      editing={undefined}
      copyOf={source?.ok === true ? source.data.data : undefined}
    />
  );
}
