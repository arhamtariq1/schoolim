'use client';

import {
  ROUTES,
  type FeeHead,
  type FeeTotals,
  PAYMENT_METHOD_LABELS,
  type StudentFee,
  type StudentFeePaymentHistoryEntry,
  type StudentGuardian,
  type StudentProfile,
} from '@ilm/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardTable,
  cn,
  ConfirmDialog,
  DateDisplay,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Money,
  SimpleSelect,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
  type CardTableColumn,
  type StatusTone,
} from '@ilm/ui';
import {
  AccountIcon,
  CalendarIcon,
  ClassIcon,
  CreateIcon,
  DeleteIcon,
  EditIcon,
  FeesIcon,
  HistoryIcon,
  LocationIcon,
  MoreIcon,
  OverdueIcon,
  PhoneIcon,
  SessionIcon,
  StudentsIcon,
  SuccessIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { EditStudentDialog } from './edit-student-dialog';
import { EditStudentFeesDialog } from './edit-student-fees-dialog';
import { GuardianDialog } from './guardian-dialog';
import { StudentProfileAttendancePanel } from './student-profile-attendance';

import { mutateOrThrow } from '@/lib/mutate';
import { displayPhone } from '@/lib/phone-format';

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  GRADUATED: 'neutral',
  LEFT: 'warning',
  STRUCK_OFF: 'danger',
};

function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

export interface StudentProfileViewProps {
  readonly student: StudentProfile;
  readonly heads: readonly FeeHead[];
  readonly feePayments: readonly StudentFeePaymentHistoryEntry[];
  readonly can: {
    update: boolean;
    guardians: boolean;
    fees: boolean;
    feePayments: boolean;
    attendance: boolean;
  };
}

export function StudentProfileView({ student, heads, feePayments, can }: StudentProfileViewProps) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [editingFees, setEditingFees] = useState(false);
  const [guardianDialog, setGuardianDialog] = useState<
    { mode: 'add' } | { mode: 'edit'; guardian: StudentGuardian } | undefined
  >(undefined);
  const [detaching, setDetaching] = useState<StudentGuardian | undefined>(undefined);

  const current = student.enrollments.find((entry) => entry.status === 'ENROLLED');
  const primaryGuardian =
    student.guardians.find((entry) => entry.isPrimary) ?? student.guardians[0];

  const sessionOptions = useMemo(() => {
    const names = [...new Set(student.enrollments.map((entry) => entry.sessionName))];
    return names.map((name) => ({
      value: name,
      label: name === current?.sessionName ? `${name.replace(/-/g, ' - ')} (Current)` : name.replace(/-/g, ' - '),
    }));
  }, [student.enrollments, current?.sessionName]);

  const [sessionFilter, setSessionFilter] = useState(current?.sessionName ?? sessionOptions[0]?.value ?? '');

  return (
    <div className="w-full space-y-6">
      <Card className="shadow-raised">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex min-w-0 flex-1 gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {initials(student.firstName, student.lastName)}
            </span>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  {student.firstName} {student.lastName}
                </h1>
                <StatusBadge tone={STATUS_TONE[student.status] ?? 'neutral'}>
                  {humanise(student.status)}
                </StatusBadge>
              </div>

              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>
                  GR: <span className="font-mono text-foreground">{student.grNo}</span>
                </span>
                <MetaDivider />
                <span>
                  Student ID:{' '}
                  <span className="font-mono text-foreground">{student.studentCode}</span>
                </span>
                <MetaDivider />
                <span>
                  Class:{' '}
                  <span className="text-foreground">
                    {current?.className ?? student.className ?? '—'}
                  </span>
                </span>
                <MetaDivider />
                <span>
                  Section:{' '}
                  <span className="text-foreground">
                    {current?.sectionName ?? student.sectionName ?? '—'}
                  </span>
                </span>
              </p>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {student.gender === null ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <AccountIcon className="size-4 shrink-0" aria-hidden="true" />
                    {humanise(student.gender)}
                  </span>
                )}
                {student.dateOfBirth === null ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarIcon className="size-4 shrink-0" aria-hidden="true" />
                    <DateDisplay value={student.dateOfBirth} />
                  </span>
                )}
                {primaryGuardian?.phone === null || primaryGuardian?.phone === undefined ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <PhoneIcon className="size-4 shrink-0" aria-hidden="true" />
                    <a href={`tel:${primaryGuardian.phone}`} className="text-foreground underline">
                      {displayPhone(primaryGuardian.phone)}
                    </a>
                  </span>
                )}
                {student.address === null || student.address === '' ? null : (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <LocationIcon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate text-foreground">{student.address}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {can.update ? (
              <>
                <Button
                  tone="outline"
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  <EditIcon className="size-4" aria-hidden="true" />
                  Edit student
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" tone="outline" size="icon" className="size-9" aria-label="More actions">
                      <MoreIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {can.fees ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditingFees(true);
                        }}
                      >
                        <FeesIcon className="size-4" aria-hidden="true" />
                        Edit fees
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {student.status !== 'ACTIVE' && student.leavingReason !== null ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <span className="font-medium">{humanise(student.status)}</span>
          {student.leftOn === null ? null : (
            <>
              {' on '}
              <DateDisplay value={student.leftOn} />
            </>
          )}
          {' — '}
          {student.leavingReason}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          {(
            [
              ['overview', 'Overview'],
              ['fees', 'Fees'],
              ['attendance', 'Attendance'],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewPanel
            student={student}
            current={current}
            sessionOptions={sessionOptions}
            sessionFilter={sessionFilter}
            onSessionFilterChange={setSessionFilter}
            can={can}
            onEditFees={() => {
              setEditingFees(true);
            }}
            onAddGuardian={() => {
              setGuardianDialog({ mode: 'add' });
            }}
            onEditGuardian={(guardian) => {
              setGuardianDialog({ mode: 'edit', guardian });
            }}
            onRemoveGuardian={setDetaching}
            onEditStudent={() => {
              setEditing(true);
            }}
          />
        </TabsContent>

        <TabsContent value="fees" className="mt-6">
          {can.feePayments ? (
            <FeePaymentHistorySection payments={feePayments} />
          ) : (
            <EmptyState
              title="Fee history"
              description="You do not have permission to view fee receipts for this student."
            />
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-6">
          {can.attendance ? (
            <StudentProfileAttendancePanel
              studentId={student.id}
              classLevelId={current?.classLevelId}
              className={current?.className ?? student.className ?? undefined}
              sessionId={current?.sessionId}
            />
          ) : (
            <EmptyState
              title="Attendance"
              description="You do not have permission to view attendance reports."
            />
          )}
        </TabsContent>
      </Tabs>

      <EditStudentDialog student={student} open={editing} onOpenChange={setEditing} />

      {can.fees ? (
        <EditStudentFeesDialog
          studentId={student.id}
          studentName={`${student.firstName} ${student.lastName}`}
          fees={student.fees}
          heads={heads}
          open={editingFees}
          onOpenChange={setEditingFees}
        />
      ) : null}

      {guardianDialog === undefined ? null : (
        <GuardianDialog
          studentId={student.id}
          open
          mode={guardianDialog.mode}
          guardian={guardianDialog.mode === 'edit' ? guardianDialog.guardian : undefined}
          onOpenChange={(next) => {
            if (!next) {
              setGuardianDialog(undefined);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={detaching !== undefined}
        onOpenChange={(next) => {
          if (!next) {
            setDetaching(undefined);
          }
        }}
        title={`Remove ${detaching?.name ?? ''} from this student?`}
        description="The guardian record stays on file. Only the link to this student is removed."
        confirmLabel="Remove"
        onConfirm={async () => {
          const target = detaching;
          if (target === undefined) {
            return;
          }
          await mutateOrThrow(ROUTES.students.guardianDetach(student.id, target.id), 'DELETE');
          toast.success(`${target.name} removed`);
          router.refresh();
        }}
      />
    </div>
  );
}

function OverviewPanel({
  student,
  current,
  sessionOptions,
  sessionFilter,
  onSessionFilterChange,
  can,
  onEditFees,
  onAddGuardian,
  onEditGuardian,
  onRemoveGuardian,
  onEditStudent,
}: {
  student: StudentProfile;
  current: StudentProfile['enrollments'][number] | undefined;
  sessionOptions: { value: string; label: string }[];
  sessionFilter: string;
  onSessionFilterChange: (value: string) => void;
  can: StudentProfileViewProps['can'];
  onEditFees: () => void;
  onAddGuardian: () => void;
  onEditGuardian: (guardian: StudentGuardian) => void;
  onRemoveGuardian: (guardian: StudentGuardian) => void;
  onEditStudent: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <FeeSummarySection
          totals={student.feeTotals}
          sessionOptions={sessionOptions}
          sessionFilter={sessionFilter}
          onSessionFilterChange={onSessionFilterChange}
        />
        <FeeDetailsSection
          fees={student.fees}
          totals={student.feeTotals}
          canEdit={can.fees}
          onEdit={onEditFees}
        />
        <GuardiansSection
          guardians={student.guardians}
          canManage={can.guardians}
          onAdd={onAddGuardian}
          onEdit={onEditGuardian}
          onRemove={onRemoveGuardian}
        />
      </div>

      <div className="space-y-6">
        <InfoCard
          title="Personal Information"
          icon={AccountIcon}
          onEdit={can.update ? onEditStudent : undefined}
        >
          <InfoGrid
            rows={[
              ['Full name', `${student.firstName} ${student.lastName}`],
              ['Gender', student.gender === null ? null : humanise(student.gender)],
              ['Date of birth', student.dateOfBirth === null ? null : <DateDisplay value={student.dateOfBirth} key="dob" />],
              ['Blood group', student.bloodGroup],
              ['Religion', student.religion],
              ['Nationality', student.nationality],
              ['City', student.city],
              ['Address', student.address],
              ['Emergency contact', student.emergencyContact],
            ]}
          />
        </InfoCard>

        <InfoCard
          title="Admission Information"
          icon={ClassIcon}
          onEdit={can.update ? onEditStudent : undefined}
        >
          <InfoGrid
            rows={[
              ['Academic session', current?.sessionName ?? null],
              ['Class', current?.className ?? student.className],
              ['Section', current?.sectionName ?? student.sectionName],
              ['Roll number', current?.rollNo === null ? null : String(current?.rollNo ?? '')],
              [
                'Admission date',
                student.admittedOn === null ? null : <DateDisplay value={student.admittedOn} key="adm" />,
              ],
            ]}
          />
        </InfoCard>

        <EnrolmentHistorySection enrollments={student.enrollments} />
      </div>
    </div>
  );
}

function FeeSummarySection({
  totals,
  sessionOptions,
  sessionFilter,
  onSessionFilterChange,
}: {
  totals: FeeTotals;
  sessionOptions: { value: string; label: string }[];
  sessionFilter: string;
  onSessionFilterChange: (value: string) => void;
}) {
  const dueMinor = totals.payableMinor;

  return (
    <ProfilePanel title="Fee Summary" icon={FeesIcon}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {sessionOptions.length === 0 ? null : (
          <SimpleSelect
            className="w-full sm:w-56"
            value={sessionFilter}
            onValueChange={onSessionFilterChange}
            options={sessionOptions}
            ariaLabel="Academic session"
          />
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat
          label="Total Fees"
          value={<Money valueMinor={minorUnits(totals.payableMinor)} withSymbol />}
          icon={FeesIcon}
          iconClassName="bg-primary/10 text-primary"
        />
        <SummaryStat
          label="Paid"
          value={<Money valueMinor={minorUnits(0)} withSymbol dashOnZero />}
          icon={SuccessIcon}
          iconClassName="bg-success/10 text-success"
        />
        <SummaryStat
          label="Due"
          value={<Money valueMinor={minorUnits(dueMinor)} withSymbol dashOnZero />}
          icon={OverdueIcon}
          iconClassName="bg-warning/15 text-warning"
        />
        <SummaryStat
          label="Discount / Concession"
          value={<Money valueMinor={minorUnits(totals.discountMinor)} withSymbol dashOnZero />}
          icon={HistoryIcon}
          iconClassName="bg-muted text-muted-foreground"
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Paid and due on this screen follow vouchers once billing runs. Totals below reflect the fee
        structure agreed at admission.
      </p>
    </ProfilePanel>
  );
}

type StudentFeeTableRow =
  | { rowKind: 'fee'; fee: StudentFee; index: number }
  | { rowKind: 'total'; totals: FeeTotals };

function FeeDetailsSection({
  fees,
  totals,
  canEdit,
  onEdit,
}: {
  fees: readonly StudentFee[];
  totals: FeeTotals;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const tableRows = useMemo((): StudentFeeTableRow[] => {
    const lines: StudentFeeTableRow[] = fees.map((fee, index) => ({
      rowKind: 'fee',
      fee,
      index: index + 1,
    }));
    if (lines.length === 0) {
      return lines;
    }
    return [...lines, { rowKind: 'total', totals }];
  }, [fees, totals]);

  const columns = useMemo((): CardTableColumn<StudentFeeTableRow>[] => {
    return [
      {
        key: 'index',
        label: '#',
        width: 'w-[4%]',
        align: 'end',
        render: (row) =>
          row.rowKind === 'total' ? null : (
            <span className="font-mono text-sm text-muted-foreground tabular-nums">{row.index}</span>
          ),
      },
      {
        key: 'name',
        label: 'Fee Name',
        icon: FeesIcon,
        width: 'w-[18%]',
        render: (row) =>
          row.rowKind === 'total' ? (
            <span className="font-semibold text-foreground">Total</span>
          ) : (
            <span className="font-medium text-foreground">{row.fee.name}</span>
          ),
      },
      {
        key: 'standard',
        label: 'Standard Amount',
        align: 'end',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) => (
          <Money
            valueMinor={row.rowKind === 'total' ? row.totals.grossMinor : row.fee.amountMinor}
            className="font-mono tabular-nums"
          />
        ),
      },
      {
        key: 'concession',
        label: 'Concession',
        align: 'end',
        width: 'w-[11%]',
        hideOnMobile: true,
        render: (row) => {
          const minor =
            row.rowKind === 'total'
              ? row.totals.discountMinor
              : minorUnits(row.fee.amountMinor - row.fee.payableMinor);
          return (
            <Money valueMinor={minor} dashOnZero className="font-mono tabular-nums text-muted-foreground" />
          );
        },
      },
      {
        key: 'final',
        label: 'Final Amount',
        align: 'end',
        width: 'w-[12%]',
        render: (row) => (
          <Money
            valueMinor={row.rowKind === 'total' ? row.totals.payableMinor : row.fee.payableMinor}
            className={cn('font-mono tabular-nums', row.rowKind === 'total' ? 'font-semibold' : 'font-medium')}
          />
        ),
      },
      {
        key: 'paid',
        label: 'Paid',
        align: 'end',
        width: 'w-[10%]',
        hideOnMobile: true,
        render: () => <Money valueMinor={minorUnits(0)} dashOnZero className="font-mono tabular-nums" />,
      },
      {
        key: 'due',
        label: 'Due',
        align: 'end',
        width: 'w-[10%]',
        render: (row) => (
          <Money
            valueMinor={row.rowKind === 'total' ? row.totals.payableMinor : row.fee.payableMinor}
            className="font-mono tabular-nums"
          />
        ),
      },
      {
        key: 'status',
        label: 'Status',
        width: 'w-[10%]',
        hideOnMobile: true,
        render: (row) =>
          row.rowKind === 'total' ? null : (
            <StatusBadge tone="warning" size="sm">
              Due
            </StatusBadge>
          ),
      },
    ];
  }, []);

  return (
    <CardTable
      title="Fee Details"
      description="Fees agreed at admission. Edit here to change what this child is charged from now on."
      headerAction={
        canEdit ? (
          <Button tone="ghost" size="sm" onClick={onEdit}>
            <EditIcon className="size-4" aria-hidden="true" />
            Edit
          </Button>
        ) : undefined
      }
      caption="Student fee structure at admission"
      rows={tableRows}
      columns={columns}
      rowKey={(row) => (row.rowKind === 'total' ? '__total__' : row.fee.feeHeadId)}
      minWidthClass="min-w-[52rem]"
      empty={{
        title: 'No fees agreed yet',
        description: 'Set fees at admission or use Edit to add the structure for this child.',
      }}
      renderMobileRow={(row) =>
        row.rowKind === 'total' ? (
          <div className="px-4 py-3 font-semibold">
            Total · <Money valueMinor={row.totals.payableMinor} withSymbol />
          </div>
        ) : (
          <div className="space-y-1 px-4 py-3">
            <p className="font-medium">{row.fee.name}</p>
            <p className="text-sm text-muted-foreground">
              Payable <Money valueMinor={row.fee.payableMinor} withSymbol />
            </p>
          </div>
        )
      }
    />
  );
}

function FeePaymentHistorySection({
  payments,
}: {
  payments: readonly StudentFeePaymentHistoryEntry[];
}) {
  const columns = useMemo((): CardTableColumn<StudentFeePaymentHistoryEntry>[] => {
    return [
      {
        key: 'paidOn',
        label: 'Date',
        width: 'w-[11%]',
        render: (row) => <DateDisplay value={row.paidOn} />,
      },
      {
        key: 'receipt',
        label: 'Receipt',
        width: 'w-[12%]',
        render: (row) => <span className="font-mono text-sm">{row.receiptNo}</span>,
      },
      {
        key: 'description',
        label: 'Fee',
        width: 'w-[28%]',
        render: (row) => row.description,
      },
      {
        key: 'voucher',
        label: 'Voucher',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) =>
          row.voucherNo === null ? '—' : <span className="font-mono text-sm">{row.voucherNo}</span>,
      },
      {
        key: 'amount',
        label: 'Amount',
        align: 'end',
        width: 'w-[12%]',
        render: (row) => (
          <Money valueMinor={row.amountMinor} withSymbol className="font-mono tabular-nums" />
        ),
      },
      {
        key: 'method',
        label: 'Method',
        width: 'w-[12%]',
        hideOnMobile: true,
        render: (row) => PAYMENT_METHOD_LABELS[row.method],
      },
    ];
  }, []);

  return (
    <CardTable
      title="Fee history"
      description="Every confirmed payment — monthly tuition, lab, admission and other fees."
      caption="Student fee payment history"
      rows={payments}
      columns={columns}
      rowKey={(row) => row.id}
      minWidthClass="min-w-[44rem]"
      empty={{
        title: 'No payments yet',
        description: 'Receipts appear here once fees are collected against this student’s vouchers.',
      }}
    />
  );
}

function GuardiansSection({
  guardians,
  canManage,
  onAdd,
  onEdit,
  onRemove,
}: {
  guardians: readonly StudentGuardian[];
  canManage: boolean;
  onAdd: () => void;
  onEdit: (guardian: StudentGuardian) => void;
  onRemove: (guardian: StudentGuardian) => void;
}) {
  return (
    <ProfilePanel
      title="Guardians"
      icon={StudentsIcon}
      action={
        canManage ? (
          <Button tone="ghost" size="sm" onClick={onAdd}>
            <CreateIcon className="size-4" aria-hidden="true" />
            Add guardian
          </Button>
        ) : undefined
      }
    >
      {guardians.length === 0 ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          No guardian on file. Nobody can be contacted about this student.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {guardians.map((guardian) => (
            <li key={guardian.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                {initialsFromName(guardian.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{guardian.name}</p>
                <p className="text-sm text-muted-foreground">
                  {humanise(guardian.relation)}
                  {guardian.phone === null ? '' : ` · ${displayPhone(guardian.phone)}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {guardian.isPrimary ? (
                  <StatusBadge tone="success" size="sm">
                    Primary
                  </StatusBadge>
                ) : null}
                {canManage ? (
                  <>
                    <Button tone="ghost" size="icon" className="size-8" aria-label={`Edit ${guardian.name}`} onClick={() => { onEdit(guardian); }}>
                      <EditIcon className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      tone="ghost"
                      size="icon"
                      className="size-8 text-danger hover:text-danger"
                      aria-label={`Remove ${guardian.name}`}
                      onClick={() => {
                        onRemove(guardian);
                      }}
                    >
                      <DeleteIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ProfilePanel>
  );
}

function EnrolmentHistorySection({
  enrollments,
}: {
  enrollments: StudentProfile['enrollments'];
}) {
  return (
    <ProfilePanel title="Enrolment history" icon={SessionIcon}>
      {enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not enrolled in any session yet.</p>
      ) : (
        <ol className="space-y-2">
          {enrollments.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium">{entry.sessionName}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {entry.className}
                  {entry.sectionName === null ? '' : ` — ${entry.sectionName}`}
                </span>
              </div>
              <StatusBadge tone={entry.status === 'ENROLLED' ? 'success' : 'neutral'} size="sm">
                {humanise(entry.status)}
              </StatusBadge>
            </li>
          ))}
        </ol>
      )}
    </ProfilePanel>
  );
}

function ProfilePanel({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof FeesIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="shadow-raised">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function InfoCard({
  title,
  icon: Icon,
  onEdit,
  children,
}: {
  title: string;
  icon: typeof AccountIcon;
  onEdit?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <ProfilePanel
      title={title}
      icon={Icon}
      action={
        onEdit === undefined ? undefined : (
          <Button tone="ghost" size="sm" onClick={onEdit}>
            <EditIcon className="size-4" aria-hidden="true" />
            Edit
          </Button>
        )
      }
    >
      {children}
    </ProfilePanel>
  );
}

function InfoGrid({ rows }: { rows: [string, ReactNode | null | string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm text-foreground">
            {value === null || value === '' || value === undefined ? '—' : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: ReactNode;
  icon: typeof FeesIcon;
  iconClassName: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconClassName)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-base font-semibold tabular-nums text-foreground">{value}</p>
      </div>
    </div>
  );
}

function MetaDivider() {
  return <span className="text-border" aria-hidden="true">|</span>;
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? '?';
  }
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}
