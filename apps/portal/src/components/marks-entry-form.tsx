'use client';

import {
  createAssessmentSchema,
  ROUTES,
  updateAssessmentSchema,
  type AssessmentDetail,
  type ClassMarksSummary,
  type MarksRoster,
} from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  DatePicker,
  Field,
  Input,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import { ClassIcon, SettingsIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ListDataTable } from './list-data-table';

import {
  FEE_LIST_TABLE_CELL,
  LIST_TABLE_BADGE_CLASS,
  feeListTableHeader,
} from '@/components/fees/fee-list-shared';
import { WorkspacePageHeader } from '@/components/workspace-page-header';
import { fetchJson, mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

interface Row {
  studentId: string;
  name: string;
  grNo: string;
  rollNo: number | null;
  /** What is typed. Empty is "not entered"; `absent` is its own switch. */
  value: string;
  absent: boolean;
}

interface MarksEntryFormProps {
  /** Present when editing an existing assessment. */
  readonly existing?: AssessmentDetail | undefined;
  readonly classes: readonly { id: string; name: string }[];
  readonly canEdit: boolean;
  readonly canManageSetup: boolean;
  /** Latest selectable test date, `YYYY-MM-DD` — a test cannot be in the future. */
  readonly today: string;
}

/**
 * What to say under a dropdown that has nothing in it, once a class is chosen.
 * Silence would read as a broken form; the cause is that the school office has
 * not set the class up yet, and the teacher cannot fix that themselves.
 */
function emptyHint(
  noun: string,
  classLevelId: string,
  loading: boolean,
  count: number,
  editing: boolean,
): string | undefined {
  if (editing || classLevelId === '' || loading || count > 0) {
    return undefined;
  }
  return `No ${noun} are set up for this class yet. Ask the school office to add them on the class page.`;
}

/** Marks may carry at most two decimals; this mirrors the schema for live feedback. */
function parseMarks(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Marks › enter or edit one assessment.
 *
 * Two cards, then a sticky save bar: **what the test is** (class, subject,
 * type, date, total) and **what each child scored**. The class, subject, type
 * and day identify the test, so they are fixed once it is saved; an edit
 * changes the total and the marks.
 *
 * The class list arrives already narrowed to the teacher's classes by the API,
 * so there is no other class to pick. The subject and assessment-type lists are
 * the **selected class's own** — fetched when the class is chosen, so a teacher
 * is only ever offered what the school office has set up for that class (and the
 * API refuses anything else regardless). Validation uses the same schema as the
 * server and also runs live: a mark above the total turns its row red as it is
 * typed, rather than waiting for Save.
 */
export function MarksEntryForm({
  existing,
  classes,
  canEdit,
  canManageSetup,
  today,
}: MarksEntryFormProps) {
  const router = useRouter();
  const toast = useToast();
  const tenantHref = useTenantHref();
  const editing = existing !== undefined;

  // Editing keeps the test's own subject and type (they cannot change), so the
  // lists only need to name those two; creating fills them when a class is chosen.
  const [options, setOptions] = useState<{
    subjects: readonly { id: string; name: string }[];
    types: readonly { id: string; name: string }[];
  }>({
    subjects: existing === undefined ? [] : [{ id: existing.subjectId, name: existing.subjectName }],
    types: existing === undefined ? [] : [{ id: existing.typeId, name: existing.typeName }],
  });
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [classLevelId, setClassLevelId] = useState(existing?.classLevelId ?? '');
  const [subjectId, setSubjectId] = useState(existing?.subjectId ?? '');
  const [assessmentTypeId, setAssessmentTypeId] = useState(existing?.typeId ?? '');
  const [heldOn, setHeldOn] = useState(existing?.heldOn ?? '');
  const [total, setTotal] = useState(existing === undefined ? '' : String(existing.totalMarks));
  const [rows, setRows] = useState<Row[]>(
    existing?.entries.map((entry) => ({
      studentId: entry.studentId,
      name: entry.name,
      grNo: entry.grNo,
      rollNo: entry.rollNo,
      value: entry.obtained === null ? '' : String(entry.obtained),
      absent: entry.obtained === null,
    })) ?? [],
  );
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const locked = !canEdit || isPending;
  const totalNumber = parseMarks(total);
  const className =
    existing?.className ?? classes.find((entry) => entry.id === classLevelId)?.name ?? '';

  async function chooseClass(next: string): Promise<void> {
    setClassLevelId(next);
    setRows([]);
    setSubjectId('');
    setAssessmentTypeId('');
    setOptions({ subjects: [], types: [] });
    setErrors((current) => ({ ...current, classLevelId: '' }));
    if (next === '') {
      return;
    }
    setLoadingRoster(true);
    setLoadingOptions(true);
    // Together: the class list and the class's own subjects and types.
    const [roster, config] = await Promise.all([
      fetchJson<{ data: MarksRoster }>(`${ROUTES.marks.roster}?classLevelId=${next}`),
      fetchJson<{ data: ClassMarksSummary }>(ROUTES.marks.classSummary(next)),
    ]);
    setLoadingRoster(false);
    setLoadingOptions(false);

    if (config.ok) {
      setOptions({
        subjects: config.data.data.subjects.map((item) => ({ id: item.id, name: item.name })),
        types: config.data.data.assessmentTypes.map((item) => ({ id: item.id, name: item.name })),
      });
    }
    if (!roster.ok) {
      setFormError(roster.message);
      return;
    }
    if (!config.ok) {
      setFormError(config.message);
      return;
    }
    setFormError(undefined);
    setRows(roster.data.data.students.map((student) => ({ ...student, value: '', absent: false })));
  }

  function setRow(studentId: string, patch: Partial<Row>): void {
    setRows((current) =>
      current.map((row) => (row.studentId === studentId ? { ...row, ...patch } : row)),
    );
    setErrors((current) => ({ ...current, [`row.${studentId}`]: '' }));
  }

  /** The message for one row as it stands, or undefined when it is fine. */
  function rowProblem(row: Row): string | undefined {
    if (row.absent || row.value.trim() === '') {
      return undefined;
    }
    const marks = parseMarks(row.value);
    if (marks === undefined) {
      return 'Enter a number.';
    }
    if (marks < 0) {
      return 'Cannot be negative.';
    }
    if (Math.trunc(marks * 100 + 0.5) / 100 !== marks) {
      return 'At most two decimals.';
    }
    if (totalNumber !== undefined && marks > totalNumber) {
      return `Cannot exceed ${String(totalNumber)}.`;
    }
    return undefined;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrors({});
    setFormError(undefined);

    const next: Record<string, string> = {};
    const entries: { studentId: string; obtained: number | null }[] = [];

    for (const row of rows) {
      if (row.absent) {
        entries.push({ studentId: row.studentId, obtained: null });
        continue;
      }
      if (row.value.trim() === '') {
        next[`row.${row.studentId}`] = 'Enter marks, or tick absent.';
        continue;
      }
      const problem = rowProblem(row);
      if (problem !== undefined) {
        next[`row.${row.studentId}`] = problem;
        continue;
      }
      entries.push({ studentId: row.studentId, obtained: Number(row.value) });
    }

    const payload = {
      totalMarks: totalNumber ?? Number.NaN,
      entries,
      ...(editing ? {} : { classLevelId, subjectId, assessmentTypeId, heldOn }),
    };

    const parsed = editing
      ? updateAssessmentSchema.safeParse(payload)
      : createAssessmentSchema.safeParse(payload);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === undefined ? 'form' : String(issue.path[0]);
        if (key !== 'entries') {
          next[key] ??= issue.message;
        }
      }
      // Untouched selects arrive as '' and zod words that as "invalid".
      for (const [key, label] of [
        ['classLevelId', 'Choose a class.'],
        ['subjectId', 'Choose a subject.'],
        ['assessmentTypeId', 'Choose an assessment type.'],
        ['heldOn', 'Choose the test date.'],
        ['totalMarks', 'Enter the total marks, e.g. 50.'],
      ] as const) {
        if (next[key] !== undefined) {
          next[key] = label;
        }
      }
    }

    if (Object.keys(next).length > 0 || !parsed.success) {
      setErrors(next);
      setFormError('Check the highlighted fields before saving.');
      return;
    }

    setIsPending(true);
    const result = editing
      ? await mutate<{ data: AssessmentDetail }>(
          ROUTES.marks.assessment(existing.id),
          'PUT',
          parsed.data,
        )
      : await mutate<{ data: AssessmentDetail }>(ROUTES.marks.assessments, 'POST', parsed.data);
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setErrors(result.fieldErrors);
      return;
    }

    toast.success(
      editing
        ? 'Marks updated'
        : `Marks saved — ${String(entries.length)} students, ${String(totalNumber ?? 0)} total`,
    );
    router.push(tenantHref('/marks'));
    router.refresh();
  }

  const entered = rows.filter((row) => row.absent || row.value.trim() !== '').length;
  const hasLiveProblem = rows.some((row) => rowProblem(row) !== undefined);

  const columns: CardTableColumn<Row>[] = [
    {
      key: 'roll',
      label: 'Roll',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[10%]',
      headerCell: feeListTableHeader('Roll'),
      render: (row) => <span className="text-sm tabular-nums">{row.rollNo ?? '—'}</span>,
    },
    {
      key: 'student',
      label: 'Student',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[34%]',
      headerCell: feeListTableHeader('Student'),
      render: (row) => (
        <TwoLineCell
          primary={<span className="font-medium">{row.name}</span>}
          secondary={row.grNo}
          secondaryMono
        />
      ),
    },
    {
      key: 'marks',
      label: 'Obtained marks',
      ...FEE_LIST_TABLE_CELL,
      cellClassName: 'px-3 py-2',
      width: 'w-[30%]',
      headerCell: feeListTableHeader(totalNumber === undefined ? 'Obtained marks' : `Obtained marks (out of ${String(totalNumber)})`),
      render: (row) => {
        const problem = errors[`row.${row.studentId}`] || rowProblem(row);
        return (
          <div>
            <div className="flex items-center gap-2">
              <Input
                value={row.absent ? '' : row.value}
                inputMode="decimal"
                placeholder={row.absent ? 'Absent' : '0'}
                aria-label={`Obtained marks for ${row.name}`}
                aria-invalid={problem === undefined || problem === '' ? undefined : true}
                disabled={locked || row.absent}
                className="w-24"
                onChange={(event) => {
                  setRow(row.studentId, { value: event.target.value });
                }}
              />
              <span className="text-sm text-muted-foreground tabular-nums">
                / {totalNumber ?? '—'}
              </span>
            </div>
            {problem === undefined || problem === '' ? null : (
              <p className="mt-1 text-xs text-danger" role="alert">
                {problem}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'percent',
      label: 'Result',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[12%]',
      hideOnMobile: true,
      headerCell: feeListTableHeader('Result'),
      render: (row) => {
        if (row.absent) {
          return <StatusBadge tone="warning" size="sm" showIcon={false} className={LIST_TABLE_BADGE_CLASS}>Absent</StatusBadge>;
        }
        const marks = parseMarks(row.value);
        return marks === undefined || totalNumber === undefined || totalNumber === 0 || rowProblem(row) !== undefined ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span className="text-sm tabular-nums">{Math.trunc((marks / totalNumber) * 1000 + 0.5) / 10}%</span>
        );
      },
    },
    {
      key: 'absent',
      label: 'Absent',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[14%]',
      headerCell: feeListTableHeader('Absent'),
      render: (row) => (
        <Checkbox
          checked={row.absent}
          disabled={locked}
          aria-label={`${row.name} was absent`}
          onCheckedChange={(checked) => {
            setRow(row.studentId, { absent: checked === true });
          }}
        />
      ),
    },
  ];

  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      noValidate
      className="space-y-6 pb-24"
    >
      <WorkspacePageHeader
        title={editing ? 'Edit marks' : 'New assessment'}
        description={
          editing
            ? `${existing.className} · ${existing.subjectName} · ${existing.typeName}`
            : 'Choose the class, subject and test, then enter each student’s marks.'
        }
      />

      {formError === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">Assessment details</CardTitle>
            <CardDescription>
              {editing
                ? 'These identify the test, so they cannot change. You can still correct the total and the marks.'
                : 'One record per class, subject, type and day — entering the same test twice is refused.'}
            </CardDescription>
          </div>
          {canManageSetup && !editing ? (
            <Button asChild tone="outline" size="sm">
              <Link href={tenantHref('/marks/setup')}>
                <SettingsIcon className="size-4" aria-hidden="true" />
                Subjects &amp; types
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Class" error={errors['classLevelId']} required>
              <SimpleSelect
                value={classLevelId}
                onValueChange={(value) => {
                  void chooseClass(value);
                }}
                options={classes.map((entry) => ({ value: entry.id, label: entry.name, icon: ClassIcon }))}
                triggerIcon={ClassIcon}
                placeholder={classes.length === 0 ? 'No classes assigned to you' : 'Select class'}
                ariaLabel="Class"
                disabled={locked || editing || classes.length === 0}
              />
            </Field>

            <Field
              label="Subject"
              error={errors['subjectId']}
              hint={emptyHint('subjects', classLevelId, loadingOptions, options.subjects.length, editing)}
              required
            >
              <SimpleSelect
                value={subjectId}
                onValueChange={setSubjectId}
                options={options.subjects.map((entry) => ({ value: entry.id, label: entry.name }))}
                placeholder={
                  classLevelId === '' && !editing
                    ? 'Choose a class first'
                    : loadingOptions
                      ? 'Loading…'
                      : 'Select subject'
                }
                ariaLabel="Subject"
                disabled={locked || editing || classLevelId === '' || options.subjects.length === 0}
              />
            </Field>

            <Field
              label="Assessment type"
              error={errors['assessmentTypeId']}
              hint={emptyHint('assessment types', classLevelId, loadingOptions, options.types.length, editing)}
              required
            >
              <SimpleSelect
                value={assessmentTypeId}
                onValueChange={setAssessmentTypeId}
                options={options.types.map((entry) => ({ value: entry.id, label: entry.name }))}
                placeholder={
                  classLevelId === '' && !editing
                    ? 'Choose a class first'
                    : loadingOptions
                      ? 'Loading…'
                      : 'Select type'
                }
                ariaLabel="Assessment type"
                disabled={locked || editing || classLevelId === '' || options.types.length === 0}
              />
            </Field>

            <Field label="Date" error={errors['heldOn']} required>
              <DatePicker
                value={heldOn}
                onChange={setHeldOn}
                max={today}
                placeholder="Select date"
                disabled={locked || editing}
                aria-label="Test date"
              />
            </Field>

            <Field
              label="Total marks"
              error={errors['totalMarks']}
              hint="What the paper is out of, e.g. 50 or 100."
              required
            >
              <Input
                value={total}
                inputMode="decimal"
                placeholder="e.g. 50"
                disabled={locked}
                onChange={(event) => {
                  setTotal(event.target.value);
                  setErrors((current) => ({ ...current, totalMarks: '' }));
                }}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border">
          <div className="space-y-1">
            <CardTitle className="text-lg">Student marks</CardTitle>
            <CardDescription>
              {className === '' ? 'Choose a class to see its students.' : `${className} — everyone starts blank; tick Absent for a child who did not sit it.`}
            </CardDescription>
          </div>
          {rows.length === 0 ? null : (
            <p className="text-sm text-muted-foreground tabular-nums">
              {entered} of {rows.length} entered
            </p>
          )}
        </CardHeader>
        <ListDataTable
          title="Student marks"
          caption="Student marks"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.studentId}
          minWidthClass="min-w-[40rem]"
          isLoading={loadingRoster}
          empty={{
            title: classLevelId === '' ? 'No class chosen' : 'No students in this class',
            description:
              classLevelId === ''
                ? 'Pick a class above and its students will appear here.'
                : 'This class has nobody enrolled this session.',
          }}
          renderMobileRow={(row) => (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <TwoLineCell primary={<span className="font-medium">{row.name}</span>} secondary={row.grNo} secondaryMono />
              <div className="flex items-center gap-2">
                <Input
                  value={row.absent ? '' : row.value}
                  inputMode="decimal"
                  aria-label={`Obtained marks for ${row.name}`}
                  disabled={locked || row.absent}
                  className="w-20"
                  onChange={(event) => {
                    setRow(row.studentId, { value: event.target.value });
                  }}
                />
                <Checkbox
                  checked={row.absent}
                  disabled={locked}
                  aria-label={`${row.name} was absent`}
                  onCheckedChange={(checked) => {
                    setRow(row.studentId, { absent: checked === true });
                  }}
                />
              </div>
            </div>
          )}
        />
      </Card>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {hasLiveProblem
            ? 'Some marks need fixing before you can save.'
            : rows.length === 0
              ? 'Nothing to save yet.'
              : `${String(entered)} of ${String(rows.length)} students entered.`}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            tone="outline"
            onClick={() => {
              router.push(tenantHref('/marks'));
            }}
          >
            {canEdit ? 'Cancel' : 'Back'}
          </Button>
          {canEdit ? (
            <Button type="submit" isPending={isPending} disabled={rows.length === 0 || hasLiveProblem}>
              {editing ? 'Save changes' : `Save marks for ${String(rows.length)} student${rows.length === 1 ? '' : 's'}`}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
