'use client';

import { type ClassOverview } from '@ilm/contracts';
import { Button, cn, DatePicker, Field, StatusBadge } from '@ilm/ui';
import { ICON_SIZE, SuccessIcon, WarningIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * Pick a class.
 *
 * ## What the cards are actually for
 *
 * The reference version shows a row of identical cards saying "Mark attendance
 * for Class III" — a label that repeats the heading and tells nobody anything.
 * These carry the thing a head of school opens this page to find out: **which
 * classes have not been marked today.** An unmarked class is the only warning
 * colour on the screen, so the answer is available at a glance rather than by
 * opening eleven cards in turn.
 */

export interface AttendanceClassGridProps {
  overview: ClassOverview;
  /**
   * Where a card leads, as data rather than a function.
   *
   * This was `hrefFor: (id) => string`, which typechecks, builds, and then
   * throws at runtime: a Server Component cannot hand a function to a Client
   * Component — React has nothing to serialise. Props across that boundary have
   * to be values, so the prefix comes over and the href is built here.
   */
  hrefPrefix: string;
  /** Appended after the id — the `?date=` the marking screen carries through. */
  hrefSuffix?: string;
  actionLabel: string;
  title: string;
  description: string;
  /** Marking is per day; the report is per month and does not need this. */
  showDatePicker?: boolean;
  basePath: string;
  error?: string | undefined;
}

export function AttendanceClassGrid({
  overview,
  hrefPrefix,
  hrefSuffix = '',
  actionLabel,
  title,
  description,
  showDatePicker = true,
  basePath,
  error,
}: AttendanceClassGridProps) {
  const router = useRouter();

  const unmarked = overview.classes.filter(
    (entry) => entry.markedAt === null && entry.strength > 0,
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>

        {showDatePicker ? (
          <div className="w-44">
            <Field label="Date">
              <DatePicker
                value={overview.date}
                max={overview.day.reason === 'FUTURE' ? undefined : overview.date}
                onChange={(nextValue) => {
                  router.push(`${basePath}?date=${nextValue}`);
                }}
              />
            </Field>
          </div>
        ) : null}
      </header>

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {/* A closed day is stated once, at the top, rather than repeated on
          eleven cards that all say the same thing. */}
      {overview.day.isWorkingDay ? null : (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
        >
          <WarningIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0 text-warning`} aria-hidden />
          <span>{closedMessage(overview.day)}</span>
        </div>
      )}

      {overview.day.isWorkingDay && unmarked > 0 && showDatePicker ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-warning">{unmarked}</span>{' '}
          {unmarked === 1 ? 'class has' : 'classes have'} not been marked yet.
        </p>
      ) : null}

      {overview.classes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium text-foreground">No classes yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add classes under Academics before marking attendance.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {overview.classes.map((entry) => {
            const marked = entry.markedAt !== null;
            return (
              <li key={entry.classLevelId}>
                <article
                  className={cn(
                    'flex h-full flex-col rounded-xl border bg-card p-4 transition-colors',
                    marked || !overview.day.isWorkingDay
                      ? 'border-border'
                      : 'border-warning/40 bg-warning/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-medium text-foreground">{entry.className}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {entry.strength} {entry.strength === 1 ? 'student' : 'students'}
                      </p>
                    </div>
                    {!overview.day.isWorkingDay ? null : marked ? (
                      <StatusBadge tone="success">
                        <SuccessIcon className="size-3.5" aria-hidden />
                        Marked
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">Not marked</StatusBadge>
                    )}
                  </div>

                  {marked ? (
                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                      <Count label="Present" value={entry.present} tone="text-success" />
                      <Count label="Absent" value={entry.absent} tone="text-danger" />
                      <Count label="Leave" value={entry.leave} tone="text-muted-foreground" />
                    </dl>
                  ) : (
                    <div className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
                      {entry.strength === 0
                        ? 'Nobody is enrolled in this class.'
                        : 'Nothing recorded for this date.'}
                    </div>
                  )}

                  <div className="mt-4">
                    <Button
                      asChild
                      tone={marked ? 'outline' : 'primary'}
                      className="w-full"
                      disabled={entry.strength === 0}
                    >
                      <Link href={`${hrefPrefix}/${entry.classLevelId}${hrefSuffix}`}>
                        {marked ? 'Review' : actionLabel}
                      </Link>
                    </Button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

export function closedMessage(day: ClassOverview['day']): string {
  switch (day.reason) {
    case 'FUTURE':
      return 'That day has not happened yet, so there is no register to mark.';
    case 'HOLIDAY':
      return `${day.holidayName ?? 'That day'} — the school is closed, so no register is taken.`;
    case 'WEEKEND':
      return 'The school does not run on this day. Change the working days in Settings if that is wrong.';
    default:
      return 'Attendance cannot be marked for this day.';
  }
}
