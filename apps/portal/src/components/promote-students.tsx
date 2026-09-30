'use client';

import {
  ROUTES,
  type AcademicSession,
  type ClassMove,
  type PromotionPreview,
  type PromotionResult,
} from '@ilm/contracts';
import {
  Button,
  Field,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@ilm/ui';
import { ForwardIcon, ICON_SIZE, InfoIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * Academics › Promote students.
 *
 * ## Why this screen exists at all
 *
 * A session starts empty and stays that way until somebody moves the school
 * into it. Making a session current does not carry anybody across, and it must
 * not: "which class is this child in next year" has four answers — up, repeat,
 * left, undecided — and only the school knows which.
 *
 * The cost of that correctness is a screen, and this is it. Without one, the
 * first thing a school sees in its second year is a fee run for seventeen
 * students that finds two, and nothing anywhere explaining why.
 *
 * ## Class by class, not student by student
 *
 * The default answer for a whole class is the same — everyone moves up one —
 * and a school with two thousand children cannot be asked two thousand times.
 * So the screen is a short list of classes with the next one already filled in,
 * and the exceptions are handled afterwards by editing the few students who
 * were held back. That is the shape of the decision, not a simplification of
 * it.
 */

/**
 * The two non-class choices in the dropdown.
 *
 * Sentinel strings rather than a second piece of state, because a `Select` has
 * one value and "where does this class go" genuinely has one answer.
 */
const GRADUATE = 'graduate';
const LEAVE_ALONE = 'none';

export interface PromoteStudentsProps {
  readonly sessions: readonly AcademicSession[];
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
}

export function PromoteStudents({ sessions, canConfigure, error }: PromoteStudentsProps) {
  const router = useRouter();
  const toast = useToast();

  // Ordered oldest first, so "from" defaults to the current year and "to" to
  // the one after it — which is the move a school is nearly always making.
  const ordered = [...sessions].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const current = ordered.find((entry) => entry.isCurrent) ?? ordered[0];
  const following = ordered.find((entry) => entry.startDate > (current?.startDate ?? ''));

  const [fromId, setFromId] = useState(current?.id ?? '');
  const [toId, setToId] = useState(following?.id ?? '');
  const [preview, setPreview] = useState<PromotionPreview | undefined>(undefined);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [done, setDone] = useState<PromotionResult | undefined>(undefined);

  useEffect(() => {
    if (fromId === '' || toId === '' || fromId === toId) {
      setPreview(undefined);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(undefined);

    void fetch(
      `${ROUTES.academics.promotionPreview}?fromSessionId=${fromId}&toSessionId=${toId}`,
      { credentials: 'include' },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('That pair of sessions could not be read.');
        }
        return (await response.json()) as { data: PromotionPreview };
      })
      .then((body) => {
        // The effect can resolve after the sessions changed again. Without this
        // the older, slower request overwrites the newer one's answer.
        if (cancelled) {
          return;
        }
        setPreview(body.data);
        // Pre-filled with the suggestion, which is what makes this one click
        // for a school that is doing the ordinary thing.
        setTargets(
          Object.fromEntries(
            body.data.classes.map((row) => [
              row.classLevelId,
              // The top class defaults to passing out, whatever the school
              // calls it — O3, Grade 10, or Grade 5 at a primary school.
              row.suggestedAction === 'GRADUATE'
                ? GRADUATE
                : (row.suggestedToClassLevelId ?? LEAVE_ALONE),
            ]),
          ),
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : 'Could not load the preview.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fromId, toId]);

  // A class left alone sends nothing at all: the server treats an absent class
  // as "do not touch these children", so there is no third action to encode.
  const moves: ClassMove[] = Object.entries(targets).flatMap<ClassMove>(
    ([fromClassLevelId, target]) => {
      if (target === LEAVE_ALONE) {
        return [];
      }
      return target === GRADUATE
        ? [{ fromClassLevelId, action: 'GRADUATE' }]
        : [{ fromClassLevelId, action: 'MOVE', toClassLevelId: target }];
    },
  );

  const counted = (predicate: (target: string) => boolean): number =>
    (preview?.classes ?? [])
      .filter((row) => predicate(targets[row.classLevelId] ?? LEAVE_ALONE))
      .reduce((sum, row) => sum + row.toMove, 0);

  const willMove = counted((target) => target !== LEAVE_ALONE && target !== GRADUATE);
  const willGraduate = counted((target) => target === GRADUATE);

  async function run(): Promise<void> {
    if (isRunning || preview === undefined) {
      return;
    }

    setIsRunning(true);
    const result = await mutate<PromotionResult>(ROUTES.academics.promotions, 'POST', {
      // Generated per press, so a retry after a *failure* is a new run while a
      // double-click on the same press is not two.
      idempotencyKey: crypto.randomUUID(),
      fromSessionId: fromId,
      toSessionId: toId,
      moves,
    });
    setIsRunning(false);

    if (!result.ok) {
      toast.error('Nobody was moved', result.message);
      return;
    }

    setDone(result.data);
    toast.success(
      `${String(result.data.promoted)} moved into ${preview.to.name}`,
      'Assign their sections next, then generate fees for the new session.',
    );
    router.refresh();
  }

  const options = ordered.map((entry) => ({ id: entry.id, name: entry.name }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Promote students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Carry a year’s students into the next one. Nobody moves on their own — making a session
          current does not enrol anybody in it, because moving up, repeating and leaving are
          decisions only you can make.
        </p>
      </div>

      {error === undefined ? null : <Alert>{error}</Alert>}

      <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Field label="From" hint="The year ending.">
          <SessionSelect value={fromId} options={options} onChange={setFromId} />
        </Field>
        <Field label="To" hint="The year starting.">
          <SessionSelect value={toId} options={options} onChange={setToId} />
        </Field>
      </section>

      {fromId === toId ? (
        <Alert>Choose two different sessions.</Alert>
      ) : loadError !== undefined ? (
        <Alert>{loadError}</Alert>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Working out who would move…</p>
      ) : preview === undefined ? null : preview.classes.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nobody is enrolled in {preview.from.name}, so there is nothing to carry forward.
        </p>
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Class</th>
                  <th className="px-4 py-2 text-right font-medium">Students</th>
                  <th className="px-4 py-2 text-left font-medium">Moves to</th>
                </tr>
              </thead>
              <tbody>
                {preview.classes.map((row) => (
                  <tr key={row.classLevelId} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2 font-medium text-foreground">{row.className}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {row.toMove}
                      {/* The number that answers "we have 15 but it says 13". */}
                      {row.alreadyThere === 0 ? null : (
                        <span className="ms-1 text-xs text-muted-foreground">
                          (+{row.alreadyThere} already there)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={targets[row.classLevelId] ?? LEAVE_ALONE}
                        onValueChange={(next) => {
                          setTargets((current) => ({ ...current, [row.classLevelId]: next }));
                        }}
                        disabled={!canConfigure || isRunning}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {/* Every class is offered, not only the next one: a
                              school that reorganises its grades still has to be
                              able to say where a class goes. */}
                          {preview.classes.map((option) => (
                            <SelectItem key={option.classLevelId} value={option.classLevelId}>
                              {option.className}
                              {option.classLevelId === row.classLevelId ? ' (repeat)' : ''}
                            </SelectItem>
                          ))}
                          {row.suggestedToClassLevelId === null ||
                          preview.classes.some(
                            (option) => option.classLevelId === row.suggestedToClassLevelId,
                          ) ? null : (
                            <SelectItem value={row.suggestedToClassLevelId}>
                              {row.suggestedToClassName}
                            </SelectItem>
                          )}
                          {/* Passing out and not having decided yet are two
                              different statements, so they are two options. The
                              first ends the child's time at the school; the
                              second does nothing at all. */}
                          <SelectItem value={GRADUATE}>Passed out (leaves the school)</SelectItem>
                          <SelectItem value={LEAVE_ALONE}>Leave them for now</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <Note>
            Sections come across with them — a child in Grade 3 section A lands in section A of
            their new class, and {preview.to.name}’s sections are created as they are needed. Roll
            numbers follow; renumber a register alphabetically afterwards if you want it tidy.
            <br />
            No fees change, and students already enrolled in {preview.to.name} are skipped — so this
            is safe to run again.
            {willGraduate === 0
              ? null
              : ` ${String(willGraduate)} will pass out: their record becomes Graduated and they drop off every later register and fee run.`}
          </Note>

          {done === undefined ? null : (
            <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-foreground">
              {done.promoted} moved into {preview.to.name}
              {done.repeated === 0 ? '' : `, ${String(done.repeated)} repeating`}
              {done.graduated === 0 ? '' : `, ${String(done.graduated)} passed out`}
              {done.skipped === 0 ? '' : `, ${String(done.skipped)} skipped`}
              {done.sectionsCreated === 0
                ? ''
                : `, ${String(done.sectionsCreated)} ${done.sectionsCreated === 1 ? 'section' : 'sections'} created`}
              . You can generate fees for {preview.to.name} now.
            </p>
          )}

          {canConfigure ? (
            <Button
              onClick={() => void run()}
              isPending={isRunning}
              disabled={willMove + willGraduate === 0}
            >
              <ForwardIcon className={ICON_SIZE.inline} aria-hidden />
              {willMove + willGraduate === 0
                ? 'Nothing to do'
                : willMove === 0
                  ? `Pass out ${String(willGraduate)}`
                  : `Move ${String(willMove)} into ${preview.to.name}${
                      willGraduate === 0 ? '' : `, pass out ${String(willGraduate)}`
                    }`}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only an owner or principal can promote students.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SessionSelect({
  value,
  options,
  onChange,
}: {
  readonly value: string;
  readonly options: readonly { id: string; name: string }[];
  readonly onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Choose a session" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Alert({ children }: { readonly children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
    >
      {children}
    </p>
  );
}

function Note({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
      <InfoIcon className={`${ICON_SIZE.inline} mt-0.5 shrink-0`} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
