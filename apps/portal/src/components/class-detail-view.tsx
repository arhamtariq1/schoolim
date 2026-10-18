'use client';

import {
  ROUTES,
  type AssessmentListItem,
  type ClassLevel,
  type ClassMarksSummary,
  type ClassUsageItem,
  type StudentListItem,
} from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DateDisplay,
  EmptyState,
  Input,
  SimpleSelect,
  StatusBadge,
  TwoLineCell,
  useToast,
  type CardTableColumn,
} from '@ilm/ui';
import { AccountIcon, ClassIcon, CreateIcon, DeleteIcon, StudentsIcon } from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { ListDataTable } from './list-data-table';
import { ListTablePaginationFooter } from './list-table-pagination-footer';
import { ListTableScreen } from './list-table-screen';

import { DashboardStatCard } from '@/components/dashboard/dashboard-stat-card';
import { StudentAdmissionAvatar } from '@/components/dashboard/student-admission-avatar';
import {
  FEE_LIST_TABLE_CELL,
  LIST_TABLE_BADGE_CLASS,
  feeListSortableTableHeader,
  feeListTableHeader,
} from '@/components/fees/fee-list-shared';
import { ListPageToolbar } from '@/components/list-page-toolbar';
import { classDisplayMeta } from '@/lib/class-level-display';
import { mutate, mutateOrThrow } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

const STATUS_TONE: Record<string, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  GRADUATED: 'neutral',
  LEFT: 'warning',
  STRUCK_OFF: 'danger',
};

function humanise(value: string): string {
  return value.toLowerCase().replace('_', ' ');
}

type StudentSortKey = 'name' | 'gr' | 'section' | 'status';

interface ClassDetailViewProps {
  readonly entry: ClassLevel;
  readonly sessionName: string | undefined;
  readonly students: readonly StudentListItem[];
  /** How many the API says match; larger than `students.length` only past the page cap. */
  readonly studentTotal: number;
  readonly studentsError: string | undefined;
  /** Undefined when the caller may not read marks, or the request failed. */
  readonly summary: ClassMarksSummary | undefined;
  readonly assessments: readonly AssessmentListItem[];
  readonly can: { readonly marks: boolean; readonly manage: boolean };
}

/**
 * Classes › one class.
 *
 * Five tabs, the same shape as a student's page. Every number on it is read
 * from the same enrolments, assignments and assessments the rest of the product
 * writes, so the page cannot disagree with the Classes table, the staff form or
 * the marks screens.
 *
 * ## Subjects and assessment types
 *
 * Both are the school's lists — a class has no list of its own — so those tabs
 * show **every** subject and type with what has happened in this class: tests,
 * latest day, average. One with no tests here is shown as unused, not hidden,
 * because "Science has never been tested in Class 9" is the useful fact.
 */
export function ClassDetailView({
  entry,
  sessionName,
  students,
  studentTotal,
  studentsError,
  summary,
  assessments,
  can,
}: ClassDetailViewProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const meta = classDisplayMeta(entry.name, entry.numericOrder);

  return (
    <div className="w-full space-y-8">
      <Card className="shadow-raised">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex min-w-0 flex-1 gap-4">
            <span
              className={`flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${meta.iconToneClass}`}
            >
              {meta.iconCode}
            </span>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {entry.name}
                </h1>
                <StatusBadge tone={meta.tone}>{meta.levelLabel}</StatusBadge>
                {entry.isActive ? null : <StatusBadge tone="neutral">Inactive</StatusBadge>}
              </div>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Session: <span className="text-foreground">{sessionName ?? '—'}</span>
                </span>
                <span aria-hidden="true">|</span>
                <span>
                  {entry.teachers.length === 1 ? 'Class teacher' : 'Class teachers'}:{' '}
                  <span className="font-medium text-foreground">
                    {entry.teachers.length === 0
                      ? 'Not assigned'
                      : entry.teachers.map((teacher) => teacher.name).join(', ')}
                  </span>
                </span>
              </p>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Students:{' '}
                  <span className="text-foreground tabular-nums">{entry.sessionStudentCount}</span>
                </span>
                <span aria-hidden="true">|</span>
                <span>
                  Sections:{' '}
                  <span className="text-foreground">
                    {entry.sections.length === 0
                      ? 'None yet'
                      : entry.sections
                          .map((section) => `${section.name} (${String(section.studentCount)})`)
                          .join(' · ')}
                  </span>
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Section title="Overview">
        <OverviewTab entry={entry} summary={summary} />
      </Section>

      <Section title="Students" description="Everyone enrolled in this class for the session.">
        <StudentsTab
          entry={entry}
          students={students}
          studentTotal={studentTotal}
          error={studentsError}
          onOpen={(id) => {
            router.push(tenantHref(`/students/${id}`));
          }}
        />
      </Section>

      <Section
        title="Subjects"
        description={
          can.manage
            ? 'The subjects this class has. Teachers can mark only these.'
            : 'The subjects this class has.'
        }
      >
        <ClassSetupCard
          kind="subject"
          classLevelId={entry.id}
          items={summary?.subjects}
          available={summary?.availableSubjects ?? []}
          teachers={summary?.teachers ?? []}
          canManage={can.manage}
          unavailable={!can.marks}
        />
      </Section>

      <Section
        title="Assessment types"
        description={
          can.manage
            ? 'The kinds of test this class has — class test, monthly test, exam…'
            : 'The kinds of test this class has.'
        }
      >
        <ClassSetupCard
          kind="assessment type"
          classLevelId={entry.id}
          items={summary?.assessmentTypes}
          available={summary?.availableAssessmentTypes ?? []}
          teachers={[]}
          canManage={can.manage}
          unavailable={!can.marks}
        />
      </Section>

      <Section title="Tests" description="Every test entered for this class, newest first.">
        <TestsTable
          assessments={assessments}
          canOpen={can.marks}
          onOpen={(id) => {
            router.push(tenantHref(`/marks/${id}`));
          }}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description === undefined ? null : (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// --- Overview ---------------------------------------------------------------

function OverviewTab({
  entry,
  summary,
}: {
  entry: ClassLevel;
  summary: ClassMarksSummary | undefined;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          label="Students"
          value={String(entry.sessionStudentCount)}
          description="Enrolled this session"
        />
        <DashboardStatCard
          label="Sections"
          value={String(entry.sections.length)}
          description={
            entry.sections.length === 0
              ? 'None yet'
              : entry.sections.map((item) => item.name).join(' · ')
          }
        />
        <DashboardStatCard
          label="Tests entered"
          value={summary === undefined ? '—' : String(summary.testCount)}
          description="This session"
        />
        <DashboardStatCard
          label="Class average"
          value={
            summary === undefined || summary.averagePercent === null
              ? '—'
              : `${String(summary.averagePercent)}%`
          }
          description="Across all tests"
        />
      </div>
    </div>
  );
}

// --- Students ---------------------------------------------------------------

function StudentsTab({
  entry,
  students,
  studentTotal,
  error,
  onOpen,
}: {
  entry: ClassLevel;
  students: readonly StudentListItem[];
  studentTotal: number;
  error: string | undefined;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('');
  const [sortKey, setSortKey] = useState<StudentSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const sectionOptions = useMemo(
    () =>
      [
        ...new Set(students.flatMap((row) => (row.sectionName === null ? [] : [row.sectionName]))),
      ].sort(),
    [students],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((row) => {
      if (section !== '' && row.sectionName !== section) {
        return false;
      }
      return (
        needle === '' ||
        `${row.firstName} ${row.lastName} ${row.grNo} ${row.studentCode} ${row.fatherName ?? ''} ${row.guardianName ?? ''}`
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [students, search, section]);

  const sorted = useMemo(() => {
    const value = (row: StudentListItem): string => {
      switch (sortKey) {
        case 'gr':
          return row.grNo;
        case 'section':
          return row.sectionName ?? '';
        case 'status':
          return row.status;
        default:
          return `${row.firstName} ${row.lastName}`;
      }
    };
    const direction = sortDir === 'asc' ? 1 : -1;
    // `numeric` so GR-10 follows GR-9 rather than GR-1, which is how a register reads.
    return [...filtered].sort(
      (a, b) =>
        direction *
        value(a).localeCompare(value(b), undefined, { numeric: true, sensitivity: 'base' }),
    );
  }, [filtered, sortKey, sortDir]);

  const page = sorted.slice(offset, offset + limit);
  const isFiltered = search.trim() !== '' || section !== '';

  function toggleSort(key: string): void {
    const next = key as StudentSortKey;
    if (next === sortKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(next);
      setSortDir('asc');
    }
    setOffset(0);
  }

  const sort = { key: sortKey, direction: sortDir } as const;

  const columns: CardTableColumn<StudentListItem>[] = [
    {
      key: 'name',
      label: 'Student',
      sortable: true,
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[30%]',
      headerCell: feeListSortableTableHeader('Student', 'name', sort, toggleSort, StudentsIcon),
      render: (row) => (
        <div className="flex items-center gap-3">
          <StudentAdmissionAvatar
            firstName={row.firstName}
            lastName={row.lastName}
            photoUrl={row.photoUrl}
          />
          <TwoLineCell
            primary={
              <span className="font-medium">{`${row.firstName} ${row.lastName}`.trim()}</span>
            }
            secondary={row.studentCode}
            secondaryMono
          />
        </div>
      ),
    },
    {
      key: 'gr',
      label: 'GR no.',
      sortable: true,
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[14%]',
      headerCell: feeListSortableTableHeader('GR no.', 'gr', sort, toggleSort),
      render: (row) => <span className="font-mono text-sm tabular-nums">{row.grNo}</span>,
    },
    {
      key: 'section',
      label: 'Section',
      sortable: true,
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[12%]',
      headerCell: feeListSortableTableHeader('Section', 'section', sort, toggleSort),
      render: (row) =>
        row.sectionName === null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span className="text-sm">{row.sectionName}</span>
        ),
    },
    {
      key: 'father',
      label: 'Father / guardian',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[24%]',
      hideOnMobile: true,
      headerCell: feeListTableHeader('Father / guardian', AccountIcon),
      render: (row) => (
        <TwoLineCell
          primary={row.fatherName ?? row.guardianName ?? '—'}
          secondary={row.guardianPhone ?? '—'}
        />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[12%]',
      headerCell: feeListSortableTableHeader('Status', 'status', sort, toggleSort),
      render: (row) => (
        <StatusBadge
          tone={STATUS_TONE[row.status] ?? 'neutral'}
          size="sm"
          className={LIST_TABLE_BADGE_CLASS}
        >
          {humanise(row.status)}
        </StatusBadge>
      ),
    },
  ];

  return (
    <ListTableScreen
      tableTitle={`Students in ${entry.name}`}
      filters={
        <ListPageToolbar
          searchQuery={search}
          onSearchQueryChange={(value) => {
            setSearch(value);
            setOffset(0);
          }}
          searchPlaceholder="Name, GR no., Student ID or guardian…"
          searchAriaLabel={`Search students in ${entry.name}`}
          filters={
            <SimpleSelect
              className="w-full min-w-32 sm:w-40"
              ariaLabel="Filter by section"
              value={section}
              triggerIcon={ClassIcon}
              emptyOption={{ value: '', label: 'Any section' }}
              placeholder="Any section"
              disabled={sectionOptions.length === 0}
              onValueChange={(value) => {
                setSection(value);
                setOffset(0);
              }}
              options={sectionOptions.map((name) => ({ value: name, label: `Section ${name}` }))}
            />
          }
        />
      }
      footer={
        <>
          {studentTotal > students.length ? (
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Showing the first {students.length} of {studentTotal} students. Use search to find the
              rest.
            </p>
          ) : null}
          <ListTablePaginationFooter
            total={sorted.length}
            limit={limit}
            offset={offset}
            label="students"
            onPageChange={setOffset}
            onLimitChange={(next) => {
              setLimit(Number(next));
              setOffset(0);
            }}
          />
        </>
      }
    >
      <ListDataTable
        title={`Students in ${entry.name}`}
        caption="Students"
        rows={page}
        columns={columns}
        rowKey={(row) => row.id}
        minWidthClass="min-w-[52rem]"
        error={error}
        isFiltered={isFiltered}
        onClearFilters={() => {
          setSearch('');
          setSection('');
          setOffset(0);
        }}
        sort={{ key: sortKey, direction: sortDir, onToggle: toggleSort }}
        onRowClick={(row) => {
          onOpen(row.id);
        }}
        empty={{
          title: 'No students in this class',
          description:
            'Children appear here once they are admitted or promoted into this class for the current session.',
        }}
        renderMobileRow={(row) => (
          <div className="flex items-center gap-3 px-4 py-3">
            <StudentAdmissionAvatar
              firstName={row.firstName}
              lastName={row.lastName}
              photoUrl={row.photoUrl}
            />
            <TwoLineCell
              primary={
                <span className="font-medium">{`${row.firstName} ${row.lastName}`.trim()}</span>
              }
              secondary={row.grNo}
              secondaryMono
            />
          </div>
        )}
      />
    </ListTableScreen>
  );
}

// --- Subjects and assessment types -------------------------------------------

function usageColumns(
  kind: 'subject' | 'assessment type',
  withActions: boolean,
  renderActions: (row: ClassUsageItem) => ReactNode,
  renderTeacher?: (row: ClassUsageItem) => ReactNode,
): CardTableColumn<ClassUsageItem>[] {
  const label = kind === 'subject' ? 'Subject' : 'Assessment type';
  const width =
    renderTeacher === undefined
      ? withActions
        ? ['w-[28%]', 'w-[20%]', 'w-[18%]', 'w-[20%]']
        : ['w-[34%]', 'w-[22%]', 'w-[20%]', 'w-[24%]']
      : withActions
        ? ['w-[18%]', 'w-[14%]', 'w-[12%]', 'w-[16%]']
        : ['w-[24%]', 'w-[16%]', 'w-[14%]', 'w-[20%]'];
  return [
    {
      key: 'name',
      label,
      ...FEE_LIST_TABLE_CELL,
      width: width[0] ?? 'w-[30%]',
      headerCell: feeListTableHeader(label),
      render: (row) => <span className="text-sm font-medium">{row.name}</span>,
    },
    ...(renderTeacher === undefined
      ? []
      : [
          {
            key: 'teacher',
            label: 'Teacher',
            ...FEE_LIST_TABLE_CELL,
            width: 'w-[26%]',
            headerCell: feeListTableHeader('Teacher'),
            render: renderTeacher,
          } satisfies CardTableColumn<ClassUsageItem>,
        ]),
    {
      key: 'tests',
      label: 'Tests in this class',
      ...FEE_LIST_TABLE_CELL,
      width: width[1] ?? 'w-[20%]',
      headerCell: feeListTableHeader('Tests in this class'),
      render: (row) =>
        row.testCount === 0 ? (
          <StatusBadge tone="neutral" size="sm" showIcon={false}>
            Not used yet
          </StatusBadge>
        ) : (
          <span className="text-sm tabular-nums">{row.testCount}</span>
        ),
    },
    {
      key: 'last',
      label: 'Latest',
      ...FEE_LIST_TABLE_CELL,
      width: width[2] ?? 'w-[20%]',
      hideOnMobile: true,
      headerCell: feeListTableHeader('Latest'),
      render: (row) =>
        row.lastHeldOn === null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <DateDisplay value={row.lastHeldOn} className="text-sm" />
        ),
    },
    {
      key: 'avg',
      label: 'Class average',
      ...FEE_LIST_TABLE_CELL,
      width: width[3] ?? 'w-[20%]',
      headerCell: feeListTableHeader('Class average'),
      render: (row) => <AverageBar percent={row.averagePercent} />,
    },
    ...(withActions
      ? [
          {
            key: 'actions',
            label: 'Actions',
            ...FEE_LIST_TABLE_CELL,
            width: 'w-[14%]',
            headerCell: feeListTableHeader('Actions'),
            render: renderActions,
          } satisfies CardTableColumn<ClassUsageItem>,
        ]
      : []),
  ];
}

function AverageBar({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${String(Math.min(100, percent))}%` }}
        />
      </div>
      <span className="text-sm tabular-nums">{percent}%</span>
    </div>
  );
}

/**
 * One of a class's own lists — its subjects, or its assessment types.
 *
 * Anybody can read it; only the roles that may configure the school's marks see
 * the controls. Adding offers the school's existing items first and a new name
 * second, because most "new" subjects already exist under another class.
 * Removing is offered only for an item with no tests in this class: one with
 * tests says "In use" instead of a button that would be refused.
 */
function ClassSetupCard({
  kind,
  classLevelId,
  items,
  available,
  teachers,
  canManage,
  unavailable,
}: {
  kind: 'subject' | 'assessment type';
  classLevelId: string;
  items: readonly ClassUsageItem[] | undefined;
  available: readonly { id: string; name: string }[];
  /** Active teachers a subject can be given to. Unused for assessment types. */
  teachers: readonly { id: string; name: string }[];
  canManage: boolean;
  unavailable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [removing, setRemoving] = useState<ClassUsageItem | undefined>(undefined);

  const addRoute =
    kind === 'subject'
      ? ROUTES.marks.classSubjects(classLevelId)
      : ROUTES.marks.classAssessmentTypes(classLevelId);
  const removeRoute = (id: string): string =>
    kind === 'subject'
      ? ROUTES.marks.classSubject(classLevelId, id)
      : ROUTES.marks.classAssessmentType(classLevelId, id);

  if (unavailable || items === undefined) {
    return (
      <EmptyState
        title={`${kind === 'subject' ? 'Subjects' : 'Assessment types'} are not available`}
        description="You do not have permission to see marks for this class, or they could not be loaded."
      />
    );
  }

  async function add(body: { itemId: string } | { name: string }): Promise<void> {
    setIsPending(true);
    const result = await mutate(addRoute, 'POST', body);
    setIsPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(undefined);
    setDraft('');
    toast.success(`${kind === 'subject' ? 'Subject' : 'Assessment type'} added to this class`);
    router.refresh();
  }

  async function setTeacher(row: ClassUsageItem, teacherId: string): Promise<void> {
    const result = await mutate(ROUTES.marks.classSubjectTeacher(classLevelId, row.id), 'PUT', {
      teacherId: teacherId === '' ? null : teacherId,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(teacherId === '' ? `Teacher removed from ${row.name}` : `Teacher set for ${row.name}`);
    router.refresh();
  }

  const columns = usageColumns(
    kind,
    canManage,
    (row) =>
    row.testCount > 0 ? (
      <span className="text-sm text-muted-foreground">In use</span>
    ) : (
      <Button
        type="button"
        size="icon"
        tone="ghost"
        aria-label={`Remove ${row.name} from this class`}
        onClick={() => {
          setRemoving(row);
        }}
      >
        <DeleteIcon className="size-4" aria-hidden="true" />
      </Button>
    ),
    kind !== 'subject'
      ? undefined
      : (row) =>
          canManage ? (
            <SimpleSelect
              className="w-full max-w-56"
              ariaLabel={`Teacher for ${row.name}`}
              value={row.teacher?.id ?? ''}
              placeholder="Not assigned"
              emptyOption={{ value: '', label: 'Not assigned' }}
              options={teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))}
              onValueChange={(value) => {
                void setTeacher(row, value);
              }}
            />
          ) : (
            <span className={row.teacher === null ? 'text-sm text-muted-foreground' : 'text-sm'}>
              {row.teacher?.name ?? 'Not assigned'}
            </span>
          ),
  );

  const plural = kind === 'subject' ? 'subjects' : 'assessment types';

  return (
    <ListTableScreen
      tableTitle={kind === 'subject' ? 'Subjects in this class' : 'Assessment types in this class'}
      filters={
        canManage ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <SimpleSelect
                className="w-full md:w-64"
                ariaLabel={`Add an existing ${kind}`}
                value=""
                placeholder={
                  available.length === 0
                    ? `Every ${kind} is already here`
                    : `Add an existing ${kind}…`
                }
                disabled={available.length === 0 || isPending}
                onValueChange={(value) => {
                  if (value !== '') {
                    void add({ itemId: value });
                  }
                }}
                options={available.map((item) => ({ value: item.id, label: item.name }))}
              />
              <span className="text-sm text-muted-foreground md:px-1">or</span>
              <form
                className="flex flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.trim() === '') {
                    setError(`Type the new ${kind}'s name first.`);
                    return;
                  }
                  void add({ name: draft.trim() });
                }}
              >
                <Input
                  value={draft}
                  placeholder={`New ${kind} name`}
                  aria-label={`New ${kind} name`}
                  disabled={isPending}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setError(undefined);
                  }}
                />
                <Button type="submit" isPending={isPending}>
                  <CreateIcon className="size-4" aria-hidden="true" />
                  Add
                </Button>
              </form>
            </div>
            {error === undefined ? null : (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        ) : undefined
      }
    >
      <ListDataTable
        title={kind === 'subject' ? 'Subjects' : 'Assessment types'}
        caption={kind === 'subject' ? 'Subjects' : 'Assessment types'}
        rows={items}
        columns={columns}
        rowKey={(row) => row.id}
        minWidthClass="min-w-[40rem]"
        empty={{
          title: `No ${plural} for this class yet`,
          description: canManage
            ? `Add the first ${kind} above. Teachers can mark only the ${plural} a class has.`
            : `The school office has not set up ${plural} for this class yet.`,
        }}
        renderMobileRow={(row) => (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <TwoLineCell
              primary={<span className="font-medium">{row.name}</span>}
              secondary={
                kind === 'subject'
                  ? (row.teacher?.name ?? 'No teacher assigned')
                  : row.testCount === 0
                    ? 'Not used yet'
                    : `${String(row.testCount)} tests`
              }
            />
            <span className="text-sm tabular-nums">
              {row.averagePercent === null ? '—' : `${String(row.averagePercent)}%`}
            </span>
          </div>
        )}
      />

      {removing === undefined ? null : (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setRemoving(undefined);
            }
          }}
          title={`Remove ${removing.name} from this class?`}
          description={`No test in this class uses ${removing.name}, so nothing is lost. Teachers will no longer be able to mark it here. It stays on the school's list and other classes keep it.`}
          confirmLabel={`Remove ${removing.name}`}
          onConfirm={async () => {
            await mutateOrThrow(removeRoute(removing.id), 'DELETE');
            toast.success(`${removing.name} removed from this class`);
            router.refresh();
          }}
        />
      )}
    </ListTableScreen>
  );
}

function TestsTable({
  assessments,
  canOpen,
  onOpen,
}: {
  assessments: readonly AssessmentListItem[];
  canOpen: boolean;
  onOpen: (id: string) => void;
}) {
  const columns: CardTableColumn<AssessmentListItem>[] = [
    {
      key: 'date',
      label: 'Date',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[16%]',
      headerCell: feeListTableHeader('Date'),
      render: (row) => <DateDisplay value={row.heldOn} className="text-sm" />,
    },
    {
      key: 'subject',
      label: 'Subject',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[26%]',
      headerCell: feeListTableHeader('Subject'),
      render: (row) => (
        <TwoLineCell
          primary={<span className="font-medium">{row.subjectName}</span>}
          secondary={row.typeName}
        />
      ),
    },
    {
      key: 'total',
      label: 'Total marks',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[16%]',
      headerCell: feeListTableHeader('Total marks'),
      render: (row) => <span className="text-sm tabular-nums">{row.totalMarks}</span>,
    },
    {
      key: 'entered',
      label: 'Students',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[16%]',
      hideOnMobile: true,
      headerCell: feeListTableHeader('Students'),
      render: (row) => <span className="text-sm tabular-nums">{row.entryCount}</span>,
    },
    {
      key: 'avg',
      label: 'Class average',
      ...FEE_LIST_TABLE_CELL,
      width: 'w-[26%]',
      headerCell: feeListTableHeader('Class average'),
      render: (row) => <AverageBar percent={row.averagePercent} />,
    },
  ];

  return (
    <ListTableScreen tableTitle="Tests for this class">
      <ListDataTable
        title="Tests"
        caption="Tests"
        rows={assessments}
        columns={columns}
        rowKey={(row) => row.id}
        minWidthClass="min-w-[44rem]"
        {...(canOpen
          ? {
              onRowClick: (row: AssessmentListItem) => {
                onOpen(row.id);
              },
            }
          : {})}
        empty={{
          title: 'No tests entered yet',
          description: 'Tests appear here as soon as a teacher enters marks for this class.',
        }}
        renderMobileRow={(row) => (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <TwoLineCell
              primary={<span className="font-medium">{row.subjectName}</span>}
              secondary={row.typeName}
            />
            <span className="text-sm tabular-nums">
              {row.averagePercent === null ? '—' : `${String(row.averagePercent)}%`}
            </span>
          </div>
        )}
      />
    </ListTableScreen>
  );
}
