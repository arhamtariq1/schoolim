'use client';

import {
  formatTimeOfDay,
  ROUTES,
  TIMETABLE_KIND_LABELS,
  WEEKDAY_LABELS,
  type TimetableDetail,
  type TimetableEntry,
} from '@ilm/contracts';
import { Button, Card, ConfirmDialog, DateDisplay, useToast } from '@ilm/ui';
import {
  ApproveIcon,
  BreakIcon,
  ClockIcon,
  CopyIcon,
  CreateIcon,
  DateRangeIcon,
  DeleteIcon,
  EditIcon,
  ICON_SIZE,
  ListViewIcon,
  PrintIcon,
  UndoIcon,
} from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { TimetableStatusBadge } from '@/components/timetable-badges';
import { mutate } from '@/lib/mutate';
import {
  entriesByDate,
  entriesByWeekday,
  NEUTRAL_TONE,
  subjectIcon,
  subjectTones,
  type SubjectTone,
} from '@/lib/timetable-ui';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * One timetable, as the picture people expect: a week for a class, a list of
 * dates for tests and exams — with the facts about it, who teaches what, and
 * the actions beside it.
 *
 * The office gets the actions; everyone else gets the picture. The server has
 * already decided what each person may see — a draft never reaches this page for
 * anyone but the office — so nothing here checks a role.
 */
export function TimetableDetailView({
  timetable,
  canManage,
}: {
  readonly timetable: TimetableDetail;
  readonly canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const tenantHref = useTenantHref();
  const [deleting, setDeleting] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function setPublished(publish: boolean): Promise<void> {
    setIsPending(true);
    const result = await mutate(
      publish ? ROUTES.timetables.publish(timetable.id) : ROUTES.timetables.unpublish(timetable.id),
      'POST',
    );
    setIsPending(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(publish ? 'Published. Teachers and parents have been told.' : 'Taken back to a draft.');
    router.refresh();
  }

  async function confirmDelete(): Promise<void> {
    const result = await mutate(ROUTES.timetables.detail(timetable.id), 'DELETE');
    if (!result.ok) {
      toast.error(result.message);
      setDeleting(false);
      return;
    }
    toast.success('Timetable deleted.');
    router.push(tenantHref('/timetables'));
  }

  const isClass = timetable.kind === 'CLASS';
  const periods = timetable.entries.filter((entry) => !entry.isBreak);
  const editHref = tenantHref(`/timetables/${timetable.id}/edit`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">{timetable.title}</h1>
            <TimetableStatusBadge status={timetable.status} />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isClass ? 'Weekly timetable' : (timetable.assessmentType?.name ?? 'Tests and exams')} for{' '}
            {timetable.classLevel.name}
            {timetable.section === null ? '' : ` ${timetable.section.name}`} · Session {timetable.session.name}
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
            <Button asChild tone="outline">
              <Link href={editHref}>
                <EditIcon className={ICON_SIZE.inline} aria-hidden />
                Edit
              </Link>
            </Button>
            <Button asChild>
              <Link href={`${editHref}?add=1`}>
                <CreateIcon className={ICON_SIZE.inline} aria-hidden />
                {isClass ? 'Add period' : 'Add paper'}
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      {timetable.status === 'DRAFT' && canManage ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
          This is a draft — only the office can see it. Publish it and the teachers and families it concerns are told.
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {isClass ? (
            <WeekCard entries={timetable.entries} />
          ) : (
            <Card className="space-y-4 p-4 sm:p-5">
              <CardHeading icon={<DateRangeIcon className={ICON_SIZE.nav} aria-hidden />}>Schedule</CardHeading>
              <DateWise entries={timetable.entries} />
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <CardHeading icon={<ClockIcon className={ICON_SIZE.nav} aria-hidden />}>Timetable information</CardHeading>
              <TimetableStatusBadge status={timetable.status} />
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="Class">{timetable.classLevel.name}</Row>
              <Row label="Section">{timetable.section?.name ?? 'All sections'}</Row>
              <Row label="Session">{timetable.session.name}</Row>
              <Row label="Type">
                {isClass ? TIMETABLE_KIND_LABELS[timetable.kind] : (timetable.assessmentType?.name ?? 'Assessment')}
              </Row>
              {isClass && (timetable.startsOn !== null || timetable.endsOn !== null) ? (
                <Row label="Runs">
                  {timetable.startsOn === null ? '…' : <DateDisplay value={timetable.startsOn} />}
                  {' – '}
                  {timetable.endsOn === null ? '…' : <DateDisplay value={timetable.endsOn} />}
                </Row>
              ) : null}
              <Row label={isClass ? 'Periods' : 'Papers'}>{periods.length}</Row>
              <Row label="Published">
                {timetable.publishedAt === null ? 'Not yet' : <DateDisplay value={timetable.publishedAt} />}
              </Row>
            </dl>
          </Card>

          {isClass ? <SubjectsCard entries={timetable.entries} /> : null}

          {timetable.description === null ? null : (
            <Card className="space-y-2 p-5">
              <h2 className="text-sm font-semibold text-foreground">Instructions</h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{timetable.description}</p>
            </Card>
          )}

          {canManage ? (
            <Card className="space-y-3 p-5 print:hidden">
              <h2 className="text-sm font-semibold text-foreground">Actions</h2>
              <div className="space-y-2">
                <Button
                  tone={timetable.status === 'DRAFT' ? 'primary' : 'outline'}
                  className="w-full justify-start"
                  isPending={isPending}
                  onClick={() => void setPublished(timetable.status === 'DRAFT')}
                >
                  {timetable.status === 'DRAFT' ? (
                    <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
                  ) : (
                    <UndoIcon className={ICON_SIZE.inline} aria-hidden />
                  )}
                  {timetable.status === 'DRAFT' ? 'Publish' : 'Back to draft'}
                </Button>
                <Button asChild tone="outline" className="w-full justify-start">
                  <Link href={editHref}>
                    <EditIcon className={ICON_SIZE.inline} aria-hidden />
                    Edit timetable
                  </Link>
                </Button>
                <Button asChild tone="outline" className="w-full justify-start">
                  <Link href={tenantHref(`/timetables/new?copy=${timetable.id}`)}>
                    <CopyIcon className={ICON_SIZE.inline} aria-hidden />
                    Duplicate timetable
                  </Link>
                </Button>
                <Button
                  tone="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    window.print();
                  }}
                >
                  <PrintIcon className={ICON_SIZE.inline} aria-hidden />
                  Print or save as PDF
                </Button>
                <Button
                  tone="outline"
                  className="w-full justify-start border-danger/40 text-danger hover:bg-danger/10"
                  onClick={() => {
                    setDeleting(true);
                  }}
                >
                  <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                  Delete timetable
                </Button>
              </div>
            </Card>
          ) : (
            <Button
              tone="outline"
              className="w-full print:hidden"
              onClick={() => {
                window.print();
              }}
            >
              <PrintIcon className={ICON_SIZE.inline} aria-hidden />
              Print or save as PDF
            </Button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${timetable.title}?`}
        description="Its periods and its events on the calendar are removed with it. Teachers and parents are not notified."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function CardHeading({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </h2>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-end font-medium text-foreground">{children}</dd>
    </div>
  );
}

// --- A class: the week --------------------------------------------------------

/** What fills a cell: the subject with its icon, then who and where. */
function Slot({ entry, tone }: { readonly entry: TimetableEntry; readonly tone: SubjectTone }) {
  if (entry.isBreak) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg bg-muted px-2.5 py-3">
        <BreakIcon className={`${ICON_SIZE.inline} text-muted-foreground`} aria-hidden />
        <p className="text-sm font-semibold text-foreground">{entry.notes ?? 'Break'}</p>
      </div>
    );
  }
  const Icon = subjectIcon(entry.subject?.name ?? '');
  return (
    <div className={`h-full rounded-lg border px-3 py-2.5 ${tone.card}`}>
      <p className={`flex items-center gap-1.5 text-sm font-semibold ${tone.icon}`}>
        <Icon className={`${ICON_SIZE.inline} shrink-0 ${tone.icon}`} aria-hidden />
        <span className="min-w-0 truncate">{entry.subject?.name ?? 'Period'}</span>
      </p>
      {entry.teacher === null ? null : <p className="mt-1 text-xs text-muted-foreground">{entry.teacher.name}</p>}
      {entry.room === null ? null : <p className="text-xs text-muted-foreground">Room {entry.room}</p>}
      {entry.notes === null ? null : <p className="mt-1 text-xs text-muted-foreground">{entry.notes}</p>}
    </div>
  );
}

function WeekCard({ entries }: { readonly entries: readonly TimetableEntry[] }) {
  const [view, setView] = useState<'week' | 'list'>('week');

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardHeading icon={<DateRangeIcon className={ICON_SIZE.nav} aria-hidden />}>Weekly timetable</CardHeading>
        <div role="group" aria-label="View" className="flex gap-1 rounded-lg border border-border p-0.5 print:hidden">
          <Button
            size="sm"
            tone={view === 'week' ? 'primary' : 'ghost'}
            aria-pressed={view === 'week'}
            onClick={() => {
              setView('week');
            }}
          >
            Weekly view
          </Button>
          <Button
            size="sm"
            tone={view === 'list' ? 'primary' : 'ghost'}
            aria-pressed={view === 'list'}
            onClick={() => {
              setView('list');
            }}
          >
            <ListViewIcon className={ICON_SIZE.inline} aria-hidden />
            List view
          </Button>
        </div>
      </div>
      <WeeklyGrid entries={entries} view={view} />
    </Card>
  );
}

export function WeeklyGrid({
  entries,
  view,
}: {
  readonly entries: readonly TimetableEntry[];
  readonly view: 'week' | 'list';
}) {
  const byDay = entriesByWeekday(entries);
  const tones = subjectTones(entries);
  const toneOf = (entry: TimetableEntry): SubjectTone =>
    (entry.subject === null ? undefined : tones.get(entry.subject.id)) ?? NEUTRAL_TONE;
  // Monday to Friday always; the weekend only when something is on it.
  const days = [1, 2, 3, 4, 5, 6, 7].filter((day) => day <= 5 || byDay.has(day));
  const slots = [
    ...new Map(entries.map((entry) => [`${entry.startTime}-${entry.endTime}`, entry] as const)).values(),
  ]
    .map((entry) => ({ startTime: entry.startTime, endTime: entry.endTime }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));

  return (
    <>
      <div className={view === 'week' ? 'hidden overflow-x-auto rounded-xl border border-border md:block' : 'hidden'}>
        <table className="w-full min-w-[40rem] border-collapse text-start">
          <caption className="sr-only">Weekly timetable</caption>
          <thead>
            <tr>
              <th scope="col" className="w-28 bg-primary/5 px-3 py-3 text-start text-xs font-semibold text-foreground">
                Time
              </th>
              {days.map((day) => (
                <th key={day} scope="col" className="border-s border-primary/15 bg-primary/5 px-3 py-3 text-center text-xs font-semibold text-foreground">
                  {WEEKDAY_LABELS[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => {
              const inSlot = (day: number): TimetableEntry[] =>
                (byDay.get(day) ?? []).filter(
                  (entry) => entry.startTime === slot.startTime && entry.endTime === slot.endTime,
                );
              // A break that every day shares is one band across the week.
              const sharedBreak = days.every((day) => {
                const here = inSlot(day);
                return here.length > 0 && here.every((entry) => entry.isBreak);
              })
                ? inSlot(days[0] ?? 1)[0]
                : undefined;

              return (
                <tr key={`${slot.startTime}-${slot.endTime}`}>
                  <th scope="row" className="border-t border-border/60 px-3 py-2.5 text-start align-top text-xs font-semibold whitespace-nowrap text-foreground">
                    {formatTimeOfDay(slot.startTime)} -<span className="block">{formatTimeOfDay(slot.endTime)}</span>
                  </th>
                  {sharedBreak === undefined ? (
                    days.map((day) => (
                      <td key={day} className="border-s border-t border-border/60 p-1.5 align-top">
                        <div className="space-y-1.5">
                          {inSlot(day).map((entry) => (
                            <Slot key={entry.id} entry={entry} tone={toneOf(entry)} />
                          ))}
                        </div>
                      </td>
                    ))
                  ) : (
                    <td colSpan={days.length} className="border-s border-t border-border/60 p-1.5">
                      <Slot entry={sharedBreak} tone={NEUTRAL_TONE} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The list view, and below 768px the grid becomes a list a day at a time (docs/16 §9). */}
      <div className={view === 'week' ? 'space-y-4 md:hidden' : 'space-y-4'}>
        {days.map((day) => {
          const here = byDay.get(day) ?? [];
          return (
            <section key={day} className="space-y-2.5 rounded-xl border border-border px-4 py-3.5">
              <h3 className="text-sm font-semibold text-foreground">{WEEKDAY_LABELS[day]}</h3>
              {here.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
              ) : (
                <ul className="space-y-2">
                  {here.map((entry) => (
                    <li key={entry.id} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        {formatTimeOfDay(entry.startTime)} – {formatTimeOfDay(entry.endTime)}
                      </p>
                      <Slot entry={entry} tone={toneOf(entry)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** Who teaches what, with the colour the grid gives it. */
function SubjectsCard({ entries }: { readonly entries: readonly TimetableEntry[] }) {
  const tones = subjectTones(entries);
  const rows = new Map<string, { name: string; teachers: Set<string> }>();
  for (const entry of entries) {
    if (entry.subject === null) continue;
    const row = rows.get(entry.subject.id) ?? { name: entry.subject.name, teachers: new Set<string>() };
    if (entry.teacher !== null) row.teachers.add(entry.teacher.name);
    rows.set(entry.subject.id, row);
  }
  const sorted = [...rows.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold text-foreground">Subjects &amp; teachers</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subjects chosen for the periods yet.</p>
      ) : (
        <ul className="space-y-2.5 text-sm">
          {sorted.map(([id, row]) => (
            <li key={id} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-foreground">
                <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${(tones.get(id) ?? NEUTRAL_TONE).dot}`} />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="min-w-0 truncate text-end text-muted-foreground">
                {row.teachers.size === 0 ? '—' : [...row.teachers].join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- A test or exam: the dates ----------------------------------------------

/**
 * The papers, a day at a time: the date on the left the way a diary shows it,
 * and beside it that day's papers in the colour the school's subject gets
 * everywhere else on a timetable.
 */
/**
 * The papers as the same coloured grid a class's week uses: a column for each
 * exam day, a row for each time, a coloured cell for each paper. Below 768px it
 * becomes a list a day at a time.
 */
function DateWise({ entries }: { readonly entries: readonly TimetableEntry[] }) {
  const byDate = new Map(entriesByDate(entries));
  const dates = [...byDate.keys()];
  const tones = subjectTones(entries);
  const toneOf = (entry: TimetableEntry): SubjectTone =>
    (entry.subject === null ? undefined : tones.get(entry.subject.id)) ?? NEUTRAL_TONE;
  const slots = [
    ...new Map(entries.map((entry) => [`${entry.startTime}-${entry.endTime}`, entry] as const)).values(),
  ]
    .map((entry) => ({ startTime: entry.startTime, endTime: entry.endTime }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full min-w-[40rem] border-collapse text-start">
          <caption className="sr-only">Schedule</caption>
          <thead>
            <tr>
              <th scope="col" className="w-28 bg-primary/5 px-3 py-3 text-start text-xs font-semibold text-foreground">
                Time
              </th>
              {dates.map((date) => (
                <th key={date} scope="col" className="border-s border-primary/15 bg-primary/5 px-3 py-3 text-center text-xs font-semibold text-foreground">
                  <DateDisplay value={date} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => (
              <tr key={`${slot.startTime}-${slot.endTime}`}>
                <th scope="row" className="border-t border-border/60 px-3 py-2.5 text-start align-top text-xs font-semibold whitespace-nowrap text-foreground">
                  {formatTimeOfDay(slot.startTime)} -<span className="block">{formatTimeOfDay(slot.endTime)}</span>
                </th>
                {dates.map((date) => (
                  <td key={date} className="border-s border-t border-border/60 p-1.5 align-top">
                    <div className="space-y-1.5">
                      {(byDate.get(date) ?? [])
                        .filter((paper) => paper.startTime === slot.startTime && paper.endTime === slot.endTime)
                        .map((paper) => (
                          <Slot key={paper.id} entry={paper} tone={toneOf(paper)} />
                        ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        {dates.map((date) => (
          <section key={date} className="space-y-2.5 rounded-xl border border-border px-4 py-3.5">
            <h3 className="text-sm font-semibold text-foreground">
              <DateDisplay value={date} />
            </h3>
            <ul className="space-y-2">
              {(byDate.get(date) ?? []).map((paper) => (
                <li key={paper.id} className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatTimeOfDay(paper.startTime)} – {formatTimeOfDay(paper.endTime)}
                  </p>
                  <Slot entry={paper} tone={toneOf(paper)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
