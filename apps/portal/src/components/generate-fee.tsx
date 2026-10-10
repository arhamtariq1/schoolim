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
import {
  Button,
  Checkbox,
  cn,
  DateDisplay,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Money,
  SimpleSelect,
  StatusBadge,
  useToast,
} from '@ilm/ui';
import {
  AccountIcon,
  ApproveIcon,
  ClassIcon,
  CreateIcon,
  FeesIcon,
  ICON_SIZE,
  MoreIcon,
  SearchIcon,
  SpinnerIcon,
  StudentsIcon,
  ViewIcon,
  WarningIcon,
} from '@ilm/ui/icons';
import { systemClock } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
  schoolName?: string | undefined;
  error?: string | undefined;
}

type ScopeKind = 'STUDENT' | 'CLASS' | 'ALL';

const SCOPES: readonly {
  key: ScopeKind;
  label: string;
  description: string;
  icon: typeof AccountIcon;
}[] = [
  {
    key: 'STUDENT',
    label: 'One student',
    description: 'Generate fee for a single student.',
    icon: AccountIcon,
  },
  {
    key: 'CLASS',
    label: 'A whole class',
    description: 'Generate fee for all students in a class.',
    icon: ClassIcon,
  },
  {
    key: 'ALL',
    label: 'Every student',
    description: 'Generate fee for all students.',
    icon: StudentsIcon,
  },
];

export function GenerateFee({
  sessions,
  classes,
  heads,
  currentSessionId,
  canGenerate,
  schoolName,
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
  const [showPreviewDetails, setShowPreviewDetails] = useState(false);

  const [selected, setSelected] = useState<{ id: string; override: string }[]>([]);
  const [includeArrears, setIncludeArrears] = useState(true);
  const [applyLateFee, setApplyLateFee] = useState(true);

  const [preview, setPreview] = useState<VoucherPreview | undefined>(undefined);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeHeads = useMemo(() => heads.filter((head) => head.isActive), [heads]);
  const activeSession = useMemo(
    () => sessions.find((entry) => entry.id === sessionId),
    [sessions, sessionId],
  );
  const billMonthOptions = useMemo(() => monthsInSession(activeSession), [activeSession]);
  const sessionLabel = activeSession?.name ?? 'Session';

  useEffect(() => {
    const allowed = new Set(billMonthOptions.map((entry) => entry.key));
    setMonths((previous) => {
      const kept = previous.filter((entry) => allowed.has(entry));
      if (kept.length > 0) {
        return kept;
      }
      const first = billMonthOptions[0]?.key;
      return first === undefined ? [] : [first];
    });
  }, [sessionId, billMonthOptions]);
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Generate fee</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bill students from their agreed fees. Totals in the preview match what Generate writes.
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

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-4">
          <ScopePicker
            active={scopeKind}
            onChange={(next) => {
              setScopeKind(next);
              setStudent(undefined);
            }}
          />

          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <StepHeader
              step={1}
              title={
                scopeKind === 'STUDENT'
                  ? 'Student details'
                  : scopeKind === 'CLASS'
                    ? 'Class details'
                    : 'Scope'
              }
              action={
                scopeKind === 'STUDENT' && student !== undefined ? (
                  <Button
                    type="button"
                    tone="outline"
                    size="sm"
                    onClick={() => {
                      setStudent(undefined);
                    }}
                  >
                    Change student
                  </Button>
                ) : null
              }
            />
            <div className="mt-4">
              {scopeKind === 'STUDENT' ? (
                <StudentPicker sessionId={sessionId} student={student} onPick={setStudent} />
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
                      options={sections.map((section) => ({
                        value: section.id,
                        label: section.name,
                      }))}
                      onValueChange={setSectionId}
                    />
                  </Field>
                </div>
              ) : null}
              {scopeKind === 'ALL' ? (
                <p className="text-sm text-muted-foreground">
                  Every student enrolled in the selected session will be included.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <StepHeader step={2} title="Fee period" />
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Session" required>
                  <SimpleSelect
                    value={sessionId}
                    options={sessions.map((entry) => ({
                      value: entry.id,
                      label: entry.isCurrent ? `${entry.name} (current)` : entry.name,
                    }))}
                    onValueChange={setSessionId}
                  />
                </Field>
                <Field label="Issue date" required>
                  <DatePicker value={issueDate} onChange={setIssueDate} />
                </Field>
                <Field
                  label="Due date"
                  required
                  error={dueDate < issueDate ? 'Cannot be before the issue date.' : undefined}
                >
                  <DatePicker value={dueDate} onChange={setDueDate} />
                </Field>
                <Field
                  label="Valid till"
                  required
                  error={validTill < dueDate ? 'Cannot be before the due date.' : undefined}
                >
                  <DatePicker value={validTill} onChange={setValidTill} />
                </Field>
              </div>
              <BillMonthGrid
                options={billMonthOptions}
                selected={months}
                onToggle={(monthKey) => {
                  setMonths(
                    months.includes(monthKey)
                      ? months.filter((entry) => entry !== monthKey)
                      : [...months, monthKey].sort(),
                  );
                }}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <StepHeader step={3} title="Additional settings" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SettingCard
                label="Carry unpaid balances forward"
                hint="Earlier unpaid vouchers are printed as arrears and settled when this one is paid."
                checked={includeArrears}
                onCheckedChange={setIncludeArrears}
              />
              <SettingCard
                label="Apply the late fee after the due date"
                hint="Uses the school's own rule. Charged only if payment arrives after the due date."
                checked={applyLateFee}
                onCheckedChange={setApplyLateFee}
              />
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4">
          <FeePicker
            heads={activeHeads}
            selected={selected}
            onChange={setSelected}
            scopeLabel={scopeKind === 'STUDENT' ? 'this student' : 'everyone in scope'}
            preview={preview}
            singleStudent={scopeKind === 'STUDENT'}
          />

          <VoucherPreviewCard
            preview={preview}
            error={previewError}
            isLoading={isPreviewing}
            ready={ready}
            schoolName={schoolName}
            sessionLabel={sessionLabel}
            student={student}
            issueDate={issueDate}
            dueDate={dueDate}
            validTill={validTill}
            billMonths={months}
            singleStudent={scopeKind === 'STUDENT'}
            showDetails={showPreviewDetails}
            onToggleDetails={() => {
              setShowPreviewDetails((previous) => !previous);
            }}
          />

          {showPreviewDetails ? (
            <PreviewDetails
              preview={preview}
              ready={ready}
              singleStudent={scopeKind === 'STUDENT'}
              issueDate={issueDate}
              error={previewError}
              isLoading={isPreviewing}
            />
          ) : null}

          {canGenerate ? (
            <Button
              size="touch"
              className="w-full"
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
              You can preview totals, but generating vouchers requires permission.
            </p>
          )}
        </aside>
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
    <div
      role="radiogroup"
      aria-label="Who to bill"
      className="grid gap-3 sm:grid-cols-3"
    >
      {SCOPES.map((entry) => {
        const Icon = entry.icon;
        const isActive = entry.key === active;
        return (
          <button
            key={entry.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => {
              onChange(entry.key);
            }}
            className={cn(
              'relative flex items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors',
              isActive
                ? 'border-primary ring-1 ring-primary/30'
                : 'border-border hover:border-primary/40',
            )}
          >
            {isActive ? (
              <span className="absolute top-3 right-3 text-primary">
                <ApproveIcon className={ICON_SIZE.inline} aria-hidden />
              </span>
            ) : null}
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className={ICON_SIZE.nav} aria-hidden />
            </span>
            <span className="min-w-0 pr-6">
              <span className="block text-sm font-semibold text-foreground">{entry.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {entry.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StepHeader({
  step,
  title,
  action,
}: {
  step: number;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {step}
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function BillMonthGrid({
  options,
  selected,
  onToggle,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (monthKey: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">
        Bill months <span className="text-danger">*</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Monthly fees are charged once per month selected. Annual and one-time fees bill once per
        run.
      </p>
      {options.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Choose a session to see its months.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {options.map((entry) => {
            const isOn = selected.includes(entry.key);
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => {
                    onToggle(entry.key);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
                    isOn
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/30',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded border',
                      isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {isOn ? <ApproveIcon className="size-3" aria-hidden /> : null}
                  </span>
                  {entry.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected.length === 0 && options.length > 0 ? (
        <p className="mt-2 text-sm text-danger">Choose at least one month.</p>
      ) : null}
    </div>
  );
}

function SettingCard({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
        checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-background',
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => {
          onCheckedChange(next === true);
        }}
        className="mt-0.5"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </label>
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
}: {
  sessionId: string;
  student: StudentLookupResult | undefined;
  onPick: (student: StudentLookupResult) => void;
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
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
          aria-hidden
        >
          {initialsFromName(student.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{student.name}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
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
        <StatusBadge tone="success">Active</StatusBadge>
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

/** Which fees to charge, and an optional amount that overrides every student. */
function FeePicker({
  heads,
  selected,
  onChange,
  scopeLabel,
  preview,
  singleStudent,
}: {
  heads: FeeHead[];
  selected: { id: string; override: string }[];
  onChange: (next: { id: string; override: string }[]) => void;
  scopeLabel: string;
  preview: VoucherPreview | undefined;
  singleStudent: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const chosen = new Set(selected.map((entry) => entry.id));
  const available = heads.filter((head) => !chosen.has(head.id));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold text-foreground">Fees to charge</h2>
        <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              tone="outline"
              size="sm"
              disabled={available.length === 0}
              className={cn(
                'h-8 shrink-0 gap-1.5 whitespace-nowrap border-primary/25 bg-primary/5 px-2.5',
                'text-primary hover:bg-primary/10 hover:text-primary',
              )}
            >
              <CreateIcon className={ICON_SIZE.inline} aria-hidden />
              Add fee
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-auto">
            {available.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">All fees added.</p>
            ) : (
              available.map((head) => (
                <DropdownMenuItem
                  key={head.id}
                  onSelect={() => {
                    onChange([...selected, { id: head.id, override: '' }]);
                    setAddOpen(false);
                  }}
                >
                  {head.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Blank amount uses each child&apos;s agreed fee. An override applies to {scopeLabel}.
      </p>

      {selected.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          Add at least one fee to continue.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {selected.map((entry) => {
            const head = heads.find((candidate) => candidate.id === entry.id);
            const previewTotal =
              singleStudent && preview !== undefined
                ? preview.headTotals.find((row) => row.feeHeadId === entry.id)
                : undefined;
            const overrideMinor = rupeesToMinor(entry.override);
            const displayMinor =
              overrideMinor ??
              (singleStudent && previewTotal !== undefined
                ? previewTotal.amountMinor
                : head?.defaultAmountMinor);
            const showInput =
              editingAmountId === entry.id || entry.override !== '' || displayMinor === undefined;

            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FeesIcon className={ICON_SIZE.inline} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {head?.name ?? 'Unknown fee'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {head === undefined ? '' : FEE_FREQUENCY_LABELS[head.frequency]}
                  </span>
                </span>
                {showInput ? (
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-label={`Amount for ${head?.name ?? 'this fee'}`}
                    placeholder="Agreed"
                    value={entry.override}
                    className="w-24 text-right"
                    onChange={(event) => {
                      onChange(
                        selected.map((candidate) =>
                          candidate.id === entry.id
                            ? { ...candidate, override: event.target.value }
                            : candidate,
                        ),
                      );
                    }}
                    onBlur={() => {
                      if (entry.override === '') {
                        setEditingAmountId(null);
                      }
                    }}
                  />
                ) : (
                  <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                    <Money valueMinor={displayMinor} />
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                      aria-label={`Actions for ${head?.name ?? 'fee'}`}
                    >
                      <MoreIcon className={ICON_SIZE.inline} aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {showInput ? null : (
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditingAmountId(entry.id);
                        }}
                      >
                        Override amount
                      </DropdownMenuItem>
                    )}
                    {entry.override !== '' ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          onChange(
                            selected.map((candidate) =>
                              candidate.id === entry.id
                                ? { ...candidate, override: '' }
                                : candidate,
                            ),
                          );
                          setEditingAmountId(null);
                        }}
                      >
                        Use agreed amount
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      destructive
                      onSelect={() => {
                        onChange(selected.filter((candidate) => candidate.id !== entry.id));
                      }}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function VoucherPreviewCard({
  preview,
  error,
  isLoading,
  ready,
  schoolName,
  sessionLabel,
  student,
  issueDate,
  dueDate,
  validTill,
  billMonths,
  singleStudent,
  showDetails,
  onToggleDetails,
}: {
  preview: VoucherPreview | undefined;
  error: string | undefined;
  isLoading: boolean;
  ready: boolean;
  schoolName: string | undefined;
  sessionLabel: string;
  student: StudentLookupResult | undefined;
  issueDate: string;
  dueDate: string;
  validTill: string;
  billMonths: string[];
  singleStudent: boolean;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  const sample = preview?.samples[0];
  const lines =
    sample?.lines ??
    preview?.headTotals.map((head) => ({
      label: head.name,
      amountMinor: head.amountMinor,
      discountMinor: 0,
    })) ??
    [];
  const totalMinor = preview?.netPayableMinor ?? 0;
  const studentName = student?.name ?? sample?.studentName ?? '—';
  const grNo = student?.grNo ?? sample?.grNo ?? '—';
  const classLabel =
    student?.className === null || student?.className === undefined
      ? '—'
      : `${student.className}${student.sectionName === null ? '' : ` ${student.sectionName}`}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">Voucher preview</h2>
        <Button
          type="button"
          tone="ghost"
          size="sm"
          disabled={!ready}
          aria-expanded={showDetails}
          onClick={onToggleDetails}
        >
          <ViewIcon className={ICON_SIZE.inline} aria-hidden />
          {showDetails ? 'Hide breakdown' : 'Preview'}
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border bg-background text-[10px] leading-snug text-foreground shadow-sm">
        <div className="border-b border-border bg-muted/40 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">{schoolName ?? 'School'}</p>
              <p className="text-muted-foreground">Fee voucher</p>
            </div>
            <span className="shrink-0 rounded border border-border bg-card px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase">
              Fee voucher
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">Session: {sessionLabel}</p>
        </div>

        {!ready ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Complete the steps to see a preview.
          </p>
        ) : error !== undefined ? (
          <p className="px-3 py-4 text-xs text-danger" role="alert">
            {error}
          </p>
        ) : isLoading || preview === undefined ? (
          <p className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
            <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
            Calculating…
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 border-b border-border px-3 py-2">
              <PreviewRow label="Student" value={studentName} />
              <PreviewRow label="GR number" value={grNo ?? '—'} />
              <PreviewRow label="Class" value={classLabel} />
              <PreviewRow label="Issue date" value={<DateDisplay value={issueDate} />} />
              <PreviewRow label="Due date" value={<DateDisplay value={dueDate} />} />
              <PreviewRow label="Valid till" value={<DateDisplay value={validTill} />} />
              {billMonths.length > 0 ? (
                <PreviewRow
                  label="Bill months"
                  value={billMonths.map((month) => formatMonthShort(month)).join(', ')}
                  className="col-span-2"
                />
              ) : null}
            </dl>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="px-3 py-1 text-left font-medium">
                    Description
                  </th>
                  <th scope="col" className="px-3 py-1 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.label} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-1">{line.label}</td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums">
                      <Money valueMinor={line.amountMinor - line.discountMinor} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2 font-semibold">
              <span>{singleStudent ? 'Total' : 'Sample total'}</span>
              <span className="font-mono tabular-nums">
                <Money valueMinor={totalMinor} />
              </span>
            </div>
            {!singleStudent && preview.willCreate > 1 ? (
              <p className="border-t border-border px-3 py-1.5 text-[9px] text-muted-foreground">
                {preview.willCreate} vouchers will be created across the scope.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <>
      <dt className={cn('text-muted-foreground', className)}>{label}</dt>
      <dd className={cn('truncate font-medium', className)}>{value}</dd>
    </>
  );
}

/** What generation will do, from the endpoint that will do it. */
function PreviewDetails({
  preview,
  error,
  isLoading,
  ready,
  singleStudent,
  issueDate,
}: {
  preview: VoucherPreview | undefined;
  error: string | undefined;
  isLoading: boolean;
  ready: boolean;
  singleStudent: boolean;
  /** The day arrears are measured against — see the note beside the total. */
  issueDate: string;
}) {
  if (error !== undefined) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
      >
        {error}
      </div>
    );
  }

  if (preview === undefined || isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
        Working out the totals…
      </div>
    );
  }

  // Not "is the scope one student": a class of one, or a class where everybody
  // else was skipped, is equally not a sample of anything.
  const isWholeResult = preview.samples.length >= preview.willCreate;

  return (
    <div className="rounded-lg border border-border bg-card">
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
          <>
            <Row label="Arrears carried" value={preview.arrearsMinor} muted />
            {/* This figure is routinely smaller than the "already owes" on the
                student card above, and the difference is not an error: only
                vouchers whose due date has already passed are carried. A
                challan issued last week and due next week is owed but not yet
                late, so it is not arrears. Said here because two different
                totals for the same family, a few inches apart and unexplained,
                is how a school stops trusting both of them. */}
            <p className="pt-1 text-xs text-muted-foreground">
              Only what was already past its due date on <DateDisplay value={issueDate} />. A
              voucher that is owed but not yet due is not carried.
            </p>
          </>
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

      {/* Everything above this point is an aggregate, and an aggregate can be
          exactly right in total while being wrong for every child in it — a
          class flattened onto one figure sums to the same number as a class on
          thirty agreed rates. So a handful of real vouchers are shown line by
          line, to be read before hundreds of rows are written (docs/16 §11).

          When the run is a single student there is nothing to sample: this is
          the whole result, so it says so and opens itself. Calling it "a few"
          and hiding it behind a disclosure would be asking somebody to go
          looking for the one thing they came to check. */}
      {preview.samples.length > 0 ? (
        <details className="border-t border-border px-4 py-3" open={isWholeResult}>
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            {isWholeResult
              ? 'What will be billed'
              : `Check a few students (${String(preview.samples.length)} of ${String(preview.willCreate)})`}
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

/** `2026-09` → `Sep 2026` for the month grid. */
function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function monthsInSession(
  session: AcademicSession | undefined,
): { key: string; label: string }[] {
  if (session === undefined) {
    return [];
  }
  const result: { key: string; label: string }[] = [];
  let year = Number(session.startDate.slice(0, 4));
  let month = Number(session.startDate.slice(5, 7));
  const endKey = session.endDate.slice(0, 7);

  for (;;) {
    const key = `${String(year)}-${String(month).padStart(2, '0')}`;
    result.push({ key, label: formatMonthShort(key) });
    if (key === endKey) {
      break;
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (result.length > 24) {
      break;
    }
  }
  return result;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

/** Dates are handled as `YYYY-MM-DD` strings throughout, never as local Dates. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
