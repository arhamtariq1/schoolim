'use client';


import {
  FEE_FREQUENCY_LABELS,
  ROUTES,
  SKIP_REASON_LABELS,
  type ClassLevel,
  type AcademicSession,
  type FeeHead,
  type GenerationResult,
  type StudentLookupResult,
  type VoucherPreview,
  type VoucherScope,
} from '@ilm/contracts';
import { Button, CheckboxField, cn, DatePicker, Field, Input, Money, MonthPicker, SimpleSelect, StatusBadge, useToast } from '@ilm/ui';
import {
  CloseIcon,
  CreateIcon,
  DeleteIcon,
  ICON_SIZE,
  SearchIcon,
  SpinnerIcon,
  WarningIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * Fees › Generate.
 *
 * ## Preview is the screen, not a step
 *
 * The right-hand panel is a live preview from the same endpoint generation
 * uses, so the totals shown are the totals that will be written — docs/modules
 * §5 calls a preview computed any other way worse than none. It refreshes on a
 * short debounce as the form changes, and the Generate button is disabled while
 * it is stale, so nobody can commit against a figure they never saw.
 *
 * ## What the Amount column means
 *
 * The total **across the chosen scope**, not one child's fee. For a single
 * student those are the same number; for a class of thirty they are not, and
 * showing one student's tuition above a "Total" that sums thirty is how a
 * screen lies. Each child is still billed their own agreed amount — the
 * per-student figures are in the sample rows underneath.
 */

export interface GenerateFeeProps {
  sessions: AcademicSession[];
  classes: ClassLevel[];
  heads: FeeHead[];
  currentSessionId: string | undefined;
  canGenerate: boolean;
  error?: string | undefined;
}

type ScopeKind = 'STUDENT' | 'CLASS' | 'ALL';

const SCOPES: readonly { key: ScopeKind; label: string }[] = [
  { key: 'STUDENT', label: 'One student' },
  { key: 'CLASS', label: 'A whole class' },
  { key: 'ALL', label: 'Every student' },
];

export function GenerateFee({
  sessions,
  classes,
  heads,
  currentSessionId,
  canGenerate,
  error,
}: GenerateFeeProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [scopeKind, setScopeKind] = useState<ScopeKind>('STUDENT');
  const [student, setStudent] = useState<StudentLookupResult | undefined>(undefined);
  const [classLevelId, setClassLevelId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [sessionId, setSessionId] = useState(currentSessionId ?? sessions[0]?.id ?? '');

  const today = useMemo(() => systemClock.now().toISOString().slice(0, 10), []);
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState(() => addDays(today, 14));
  const [validTill, setValidTill] = useState(() => addDays(today, 24));

  const [months, setMonths] = useState<string[]>(() => [today.slice(0, 7)]);
  const [monthDraft, setMonthDraft] = useState(() => today.slice(0, 7));

  const [selected, setSelected] = useState<{ id: string; override: string }[]>([]);
  const [includeArrears, setIncludeArrears] = useState(true);
  const [applyLateFee, setApplyLateFee] = useState(true);

  const [preview, setPreview] = useState<VoucherPreview | undefined>(undefined);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeHeads = useMemo(() => heads.filter((head) => head.isActive), [heads]);
  const sections = useMemo(
    () => classes.find((entry) => entry.id === classLevelId)?.sections ?? [],
    [classes, classLevelId],
  );

  const scope: VoucherScope | undefined = useMemo(() => {
    if (scopeKind === 'ALL') {
      return { kind: 'ALL' };
    }
    if (scopeKind === 'STUDENT') {
      return student === undefined ? undefined : { kind: 'STUDENT', studentId: student.id };
    }
    if (classLevelId === '') {
      return undefined;
    }
    return {
      kind: 'CLASS',
      classLevelId,
      ...(sectionId === '' ? {} : { sectionId }),
    };
  }, [scopeKind, student, classLevelId, sectionId]);

  const datesValid = issueDate <= dueDate && dueDate <= validTill;
  const ready =
    scope !== undefined &&
    selected.length > 0 &&
    months.length > 0 &&
    sessionId !== '' &&
    datesValid;

  const request = useMemo(
    () =>
      !ready || scope === undefined
        ? undefined
        : {
            sessionId,
            scope,
            heads: selected.map((entry) => ({
              feeHeadId: entry.id,
              // Blank is the normal case: each child is billed their own
              // agreed amount. A figure here overrides that for everyone.
              ...(rupeesToMinor(entry.override) === undefined
                ? {}
                : { amountMinor: rupeesToMinor(entry.override) }),
            })),
            billMonths: months,
            issueDate,
            dueDate,
            validTill,
            includeArrears,
            applyLateFee,
          },
    [
      ready,
      scope,
      sessionId,
      selected,
      months,
      issueDate,
      dueDate,
      validTill,
      includeArrears,
      applyLateFee,
    ],
  );

  // The preview follows the form on a short debounce. Long enough that typing
  // an amount does not fire a request per keystroke, short enough that the
  // panel never feels detached from the controls.
  const signature = JSON.stringify(request ?? null);
  useEffect(() => {
    if (request === undefined) {
      setPreview(undefined);
      setPreviewError(undefined);
      return;
    }

    let cancelled = false;
    setIsPreviewing(true);
    const timer = setTimeout(() => {
      void (async () => {
        const result = await mutate<VoucherPreview>(ROUTES.vouchers.preview, 'POST', request);
        if (cancelled) {
          return;
        }
        setIsPreviewing(false);
        if (result.ok) {
          setPreview(result.data);
          setPreviewError(undefined);
        } else {
          setPreview(undefined);
          setPreviewError(result.message);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setIsPreviewing(false);
    };
    // Keyed on `signature` — the serialised request — as well as the object.
    // The memo hands back a fresh object every render, so depending on it alone
    // would refetch the preview on each keystroke anywhere on the page; the
    // string is what actually decides whether anything changed.
  }, [signature, request]);

  async function generate() {
    if (request === undefined) {
      return;
    }
    setIsGenerating(true);
    const result = await mutate<GenerationResult>(ROUTES.vouchers.generate, 'POST', {
      ...request,
      // New for each attempt, so a genuine second run is allowed while a
      // double-click on the same one is not.
      idempotencyKey: `gen-${String(Date.now())}-${Math.random().toString(36).slice(2, 12)}`,
    });
    setIsGenerating(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    if (result.data.created === 0) {
      toast.warning(
        'Nothing was generated',
        'Every student in this scope was skipped — most likely they are already billed for these months.',
      );
      return;
    }

    toast.success(
      `${String(result.data.created)} ${result.data.created === 1 ? 'voucher' : 'vouchers'} generated`,
      result.data.skipped > 0 ? `${String(result.data.skipped)} skipped.` : undefined,
    );
    router.push(tenantHref('/fees/vouchers'));
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Generate fee</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every child is billed their own agreed amount, discounts included. Nothing is written
          until you press Generate, and a month already billed is never billed twice.
        </p>
      </header>

      {error === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
          <ScopePicker
            active={scopeKind}
            onChange={(next) => {
              setScopeKind(next);
              setStudent(undefined);
            }}
          />

          {scopeKind === 'STUDENT' ? (
            <StudentPicker
              sessionId={sessionId}
              student={student}
              onPick={setStudent}
              onClear={() => {
                setStudent(undefined);
              }}
            />
          ) : null}

          {scopeKind === 'CLASS' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Class" required>
                <SimpleSelect
                  value={classLevelId}
                  placeholder="Choose a class"
                  options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
                  onValueChange={(next) => {
                    setClassLevelId(next);
                    setSectionId('');
                  }}
                />
              </Field>
              <Field label="Section" hint="Leave blank for the whole class.">
                <SimpleSelect
                  value={sectionId}
                  disabled={sections.length === 0}
                  emptyOption={{ value: '', label: 'All sections' }}
                  options={sections.map((section) => ({ value: section.id, label: section.name }))}
                  onValueChange={setSectionId}
                />
              </Field>
            </div>
          ) : null}

          <Field label="Session" required>
            <SimpleSelect
              value={sessionId}
              options={sessions.map((entry) => ({ value: entry.id, label: entry.name }))}
              onValueChange={setSessionId}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Issue date" required>
              <DatePicker
                value={issueDate}
                onChange={setIssueDate}
              />
            </Field>
            <Field
              label="Due date"
              required
              error={dueDate < issueDate ? 'Cannot be before the issue date.' : undefined}
            >
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
              />
            </Field>
            <Field
              label="Valid till"
              required
              hint="Printed on the challan. Banks refuse an expired one."
              error={validTill < dueDate ? 'Cannot be before the due date.' : undefined}
            >
              <DatePicker
                value={validTill}
                onChange={setValidTill}
              />
            </Field>
          </div>

          <BillMonthsField
            months={months}
            draft={monthDraft}
            onDraft={setMonthDraft}
            onAdd={() => {
              if (monthDraft !== '' && !months.includes(monthDraft)) {
                setMonths([...months, monthDraft].sort());
              }
            }}
            onRemove={(month) => {
              setMonths(months.filter((entry) => entry !== month));
            }}
          />

          <div className="space-y-3 border-t border-border pt-4">
            <CheckboxField
              label="Carry unpaid balances forward"
              hint="Earlier unpaid vouchers are printed as arrears and settled when this one is paid."
              checked={includeArrears}
              onCheckedChange={(next) => {
                setIncludeArrears(next === true);
              }}
            />
            <CheckboxField
              label="Apply the late fee after the due date"
              hint="Uses the school's own rule. Printed as a second figure; charged only if the money actually arrives late."
              checked={applyLateFee}
              onCheckedChange={(next) => {
                setApplyLateFee(next === true);
              }}
            />
          </div>
        </section>

        <section className="space-y-4">
          <FeePicker
            heads={activeHeads}
            selected={selected}
            onChange={setSelected}
            scopeLabel={scopeKind === 'STUDENT' ? 'this student' : 'everyone in scope'}
          />

          <PreviewPanel
            preview={preview}
            error={previewError}
            isLoading={isPreviewing}
            ready={ready}
            singleStudent={scopeKind === 'STUDENT'}
          />

          {canGenerate ? (
            <Button
              size="touch"
              className="w-full"
              // Disabled while the preview is stale, so nothing is committed
              // against a figure nobody has seen.
              disabled={!ready || isPreviewing || preview === undefined || preview.willCreate === 0}
              isPending={isGenerating}
              onClick={() => {
                void generate();
              }}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              {preview === undefined || preview.willCreate === 0
                ? 'Generate vouchers'
                : `Generate ${String(preview.willCreate)} ${preview.willCreate === 1 ? 'voucher' : 'vouchers'}`}
            </Button>
          ) : (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              You can see what this would produce, but not generate. Ask an administrator.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function ScopePicker({
  active,
  onChange,
}: {
  active: ScopeKind;
  onChange: (next: ScopeKind) => void;
}) {
  return (
    <div role="tablist" aria-label="Who to bill" className="flex gap-1 rounded-lg bg-muted p-1">
      {SCOPES.map((entry) => (
        <button
          key={entry.key}
          type="button"
          role="tab"
          aria-selected={entry.key === active}
          onClick={() => {
            onChange(entry.key);
          }}
          className={cn(
            'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            entry.key === active
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The GR-number / name box.
 *
 * Searches GR number, student code and name together, because the person at the
 * counter has whichever of those the parent said. Shows what the child already
 * owes next to each result — the single most useful thing to know before
 * issuing another voucher.
 */
function StudentPicker({
  sessionId,
  student,
  onPick,
  onClear,
}: {
  sessionId: string;
  student: StudentLookupResult | undefined;
  onPick: (student: StudentLookupResult) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<StudentLookupResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ q: query });
        if (sessionId !== '') {
          params.set('sessionId', sessionId);
        }
        const response = await fetch(`${ROUTES.vouchers.studentLookup}?${params.toString()}`, {
          credentials: 'include',
        });
        if (cancelled) {
          return;
        }
        setIsSearching(false);
        if (!response.ok) {
          setResults([]);
          return;
        }
        const body = (await response.json()) as { data: StudentLookupResult[] };
        setResults(body.data);
      })();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, sessionId]);

  if (student !== undefined) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{student.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            GR {student.grNo ?? '—'}
            {student.className === null ? '' : ` · ${student.className}`}
            {student.sectionName === null ? '' : ` ${student.sectionName}`}
            {student.fatherName === null ? '' : ` · Father: ${student.fatherName}`}
          </p>
          {student.outstandingMinor > 0 ? (
            <p className="mt-1 text-sm text-warning">
              Already owes <Money valueMinor={student.outstandingMinor} />
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          tone="ghost"
          size="sm"
          onClick={onClear}
          aria-label="Choose another student"
        >
          <CloseIcon className={ICON_SIZE.inline} aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <Field label="GR number or name" required>
        <div className="relative">
          <Input
            value={term}
            placeholder="Start typing a GR number or a name"
            autoComplete="off"
            onChange={(event) => {
              setTerm(event.target.value);
            }}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
            {isSearching ? (
              <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
            ) : (
              <SearchIcon className={ICON_SIZE.inline} aria-hidden />
            )}
          </span>
        </div>
      </Field>

      {results.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(result);
                  setTerm('');
                  setResults([]);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{result.name}</span>
                  <span className="block truncate text-muted-foreground">
                    GR {result.grNo ?? '—'}
                    {result.className === null ? '' : ` · ${result.className}`}
                  </span>
                </span>
                {result.outstandingMinor > 0 ? (
                  <StatusBadge tone="warning">
                    <Money valueMinor={result.outstandingMinor} />
                  </StatusBadge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {term.trim().length >= 2 && results.length === 0 && !isSearching ? (
        <p className="mt-1 text-sm text-muted-foreground">No student matches that.</p>
      ) : null}
    </div>
  );
}

/** The bill months, as chips. */
function BillMonthsField({
  months,
  draft,
  onDraft,
  onAdd,
  onRemove,
}: {
  months: string[];
  draft: string;
  onDraft: (value: string) => void;
  onAdd: () => void;
  onRemove: (month: string) => void;
}) {
  return (
    <div>
      <Field
        label="Bill months"
        required
        hint="Monthly fees are charged once per month chosen. Annual and one-time fees are charged once, whatever you pick."
      >
        <div className="flex gap-2">
          <MonthPicker
            value={draft}
            onChange={onDraft}
          />
          <Button type="button" tone="outline" onClick={onAdd} aria-label="Add this month">
            <CreateIcon className={ICON_SIZE.inline} aria-hidden />
          </Button>
        </div>
      </Field>

      {months.length === 0 ? (
        <p className="mt-2 text-sm text-danger">Choose at least one month.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {months.map((month) => (
            <li key={month}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pr-1.5 pl-3 text-sm text-foreground">
                {formatMonth(month)}
                <button
                  type="button"
                  onClick={() => {
                    onRemove(month);
                  }}
                  aria-label={`Remove ${formatMonth(month)}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                >
                  <CloseIcon className="size-3.5" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Which fees to charge, and an optional amount that overrides every student. */
function FeePicker({
  heads,
  selected,
  onChange,
  scopeLabel,
}: {
  heads: FeeHead[];
  selected: { id: string; override: string }[];
  onChange: (next: { id: string; override: string }[]) => void;
  scopeLabel: string;
}) {
  const [pending, setPending] = useState('');
  const chosen = new Set(selected.map((entry) => entry.id));
  const available = heads.filter((head) => !chosen.has(head.id));

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-base font-medium text-foreground">Fees to charge</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Leave the amount blank and each child is billed what they agreed, discount included. Type
        one and it replaces that for {scopeLabel}.
      </p>

      <div className="mt-4 flex gap-2">
        <SimpleSelect
          value={pending}
          disabled={available.length === 0}
          ariaLabel="Add a fee"
          placeholder={available.length === 0 ? 'Every fee is already added' : 'Add a fee…'}
          options={available.map((head) => ({
            value: head.id,
            label: `${head.name} — ${FEE_FREQUENCY_LABELS[head.frequency]}`,
          }))}
          onValueChange={(id) => {
            if (id !== '') {
              onChange([...selected, { id, override: '' }]);
              setPending('');
            }
          }}
        />
      </div>

      {selected.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No fees chosen yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {selected.map((entry) => {
            const head = heads.find((candidate) => candidate.id === entry.id);
            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {head?.name ?? 'Unknown fee'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {head === undefined ? '' : FEE_FREQUENCY_LABELS[head.frequency]}
                  </span>
                </span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  aria-label={`Amount for ${head?.name ?? 'this fee'}`}
                  placeholder="Agreed"
                  value={entry.override}
                  className="w-28 text-right"
                  onChange={(event) => {
                    onChange(
                      selected.map((candidate) =>
                        candidate.id === entry.id
                          ? { ...candidate, override: event.target.value }
                          : candidate,
                      ),
                    );
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove ${head?.name ?? 'this fee'}`}
                  onClick={() => {
                    onChange(selected.filter((candidate) => candidate.id !== entry.id));
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                >
                  <DeleteIcon className={ICON_SIZE.inline} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** What generation will do, from the endpoint that will do it. */
function PreviewPanel({
  preview,
  error,
  isLoading,
  ready,
  singleStudent,
}: {
  preview: VoucherPreview | undefined;
  error: string | undefined;
  isLoading: boolean;
  ready: boolean;
  singleStudent: boolean;
}) {
  if (!ready) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Choose who to bill, at least one fee and a month. The totals appear here before anything is
        written.
      </div>
    );
  }

  if (error !== undefined) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
      >
        {error}
      </div>
    );
  }

  if (preview === undefined || isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
        Working out the totals…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-base font-medium text-foreground">Before you generate</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {preview.willCreate} {preview.willCreate === 1 ? 'voucher' : 'vouchers'} will be created
          {preview.willSkip > 0 ? `, ${String(preview.willSkip)} skipped` : ''}.
        </p>
      </div>

      {preview.warnings.length > 0 ? (
        <ul className="space-y-1.5 border-b border-border bg-warning/5 px-4 py-3">
          {preview.warnings.map((warning) => (
            <li key={warning} className="flex gap-2 text-sm text-foreground">
              <WarningIcon
                className={`${ICON_SIZE.inline} mt-0.5 shrink-0 text-warning`}
                aria-hidden
              />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {preview.headTotals.length > 0 ? (
        <table className="w-full text-sm">
          <caption className="sr-only">Totals by fee</caption>
          <thead>
            <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="px-4 py-2 text-left font-medium">
                Fee
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {singleStudent ? 'Amount' : 'Total'}
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.headTotals.map((head) => (
              <tr key={head.feeHeadId} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">
                  <span className="block text-foreground">{head.name}</span>
                  {singleStudent ? null : (
                    <span className="block text-xs text-muted-foreground">
                      {head.studentCount} {head.studentCount === 1 ? 'student' : 'students'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono text-foreground tabular-nums">
                  <Money valueMinor={head.amountMinor} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <dl className="space-y-1.5 border-t border-border px-4 py-3 text-sm">
        {/* No "discounts given" line. The per-fee totals above are already net
            of them, so a bracketed figure sitting between those totals and an
            unchanged Total reads as a subtraction that never happened. The
            discounts are still visible where they mean something — against the
            individual children, under "Check a few students". */}
        {preview.arrearsMinor > 0 ? (
          <Row label="Arrears carried" value={preview.arrearsMinor} muted />
        ) : null}
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <dt className="font-medium text-foreground">Total</dt>
          <dd className="font-mono text-base font-semibold text-foreground tabular-nums">
            <Money valueMinor={preview.netPayableMinor} />
          </dd>
        </div>
      </dl>

      {preview.skipsByReason.length > 0 ? (
        <ul className="space-y-1 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          {preview.skipsByReason.map((skip) => (
            <li key={skip.reason} className="flex justify-between gap-3">
              <span>{SKIP_REASON_LABELS[skip.reason]}</span>
              <span className="tabular-nums">{skip.count}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {preview.samples.length > 0 ? (
        <details className="border-t border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Check a few students
          </summary>
          <ul className="mt-3 space-y-3">
            {preview.samples.map((sample) => (
              <li key={sample.studentId} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="truncate font-medium text-foreground">{sample.studentName}</span>
                  <span className="font-mono text-foreground tabular-nums">
                    <Money valueMinor={sample.netPayableMinor} />
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {sample.lines.map((line) => (
                    <li key={line.label} className="flex justify-between gap-3">
                      <span className="truncate">{line.label}</span>
                      <span className="tabular-nums">
                        <Money valueMinor={line.amountMinor - line.discountMinor} />
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted === true ? 'text-muted-foreground' : 'text-foreground'}>{label}</dt>
      <dd className="font-mono text-foreground tabular-nums">
        <Money valueMinor={value} />
      </dd>
    </div>
  );
}

/** `2026-09` → `September 2026`. */
function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Dates are handled as `YYYY-MM-DD` strings throughout, never as local Dates. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
