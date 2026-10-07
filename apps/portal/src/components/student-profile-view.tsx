'use client';


import {
  ROUTES,
  type FeeHead,
  type FeeTotals,
  type StudentFee,
  type StudentGuardian,
  type StudentProfile,
} from '@ilm/contracts';
import {
  Button,
  ConfirmDialog,
  DateDisplay,
  Money,
  StatusBadge,
  useToast,
  type StatusTone,
} from '@ilm/ui';
import { BackIcon, CreateIcon, DeleteIcon, EditIcon } from '@ilm/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EditStudentDialog } from './edit-student-dialog';
import { EditStudentFeesDialog } from './edit-student-fees-dialog';
import { GuardianDialog } from './guardian-dialog';

import { mutateOrThrow } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

/**
 * The student 360.
 *
 * Laid out by **who is asking**, not by which table a field lives in. The
 * person on the phone wants the guardian's number; the person at the desk wants
 * the class and the GR number. Both are above the fold and neither needs a
 * click. Details a school looks at once a year sit lower down.
 *
 * Enrolment history is a list rather than a chart. "Which class was she in two
 * years ago" is a question with a text answer, and a chart makes it harder.
 */

const STATUS_TONE: Record<string, StatusTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  GRADUATED: 'neutral',
  LEFT: 'warning',
  STRUCK_OFF: 'danger',
};

function humanise(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ');
}

export interface StudentProfileViewProps {
  readonly student: StudentProfile;
  /** The catalogue, so the fee editor can offer heads this child is not on. */
  readonly heads: readonly FeeHead[];
  readonly can: { update: boolean; guardians: boolean; fees: boolean };
}

export function StudentProfileView({ student, heads, can }: StudentProfileViewProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editingFees, setEditingFees] = useState(false);
  const [guardianDialog, setGuardianDialog] = useState<
    { mode: 'add' } | { mode: 'edit'; guardian: StudentGuardian } | undefined
  >(undefined);
  const [detaching, setDetaching] = useState<StudentGuardian | undefined>(undefined);

  const current = student.enrollments.find((entry) => entry.status === 'ENROLLED');

  return (
    <div className="space-y-6">
      <nav>
        <Link
          href={tenantHref('/students')}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline"
        >
          <BackIcon className="size-4" aria-hidden="true" />
          All students
        </Link>
      </nav>

      {/* --- Identity. The two numbers lead, because they are what gets read
          aloud on the phone and written on the file. --- */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-balance">
              {student.firstName} {student.lastName}
            </h1>
            <StatusBadge tone={STATUS_TONE[student.status] ?? 'neutral'}>
              {humanise(student.status)}
            </StatusBadge>
          </div>

          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">GR</dt>
              <dd className="font-mono select-all">{student.grNo}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Student ID</dt>
              <dd className="font-mono select-all">{student.studentCode}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Class</dt>
              <dd>
                {current === undefined ? (
                  <span className="text-muted-foreground">Not enrolled</span>
                ) : (
                  <>
                    {current.className}
                    {current.sectionName === null ? '' : ` — ${current.sectionName}`}
                    {current.rollNo === null ? '' : ` · Roll ${String(current.rollNo)}`}
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {can.update ? (
          <Button
            tone="outline"
            onClick={() => {
              setEditing(true);
            }}
          >
            <EditIcon className="size-4" aria-hidden="true" />
            Edit details
          </Button>
        ) : null}
      </header>

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

      {/* Two columns from `xl`.

          Everything used to be one tall stack, so the things a school opens
          this page for — what the family pays, who to ring — were a scroll
          away from the name at the top, and the details nobody reads twice a
          term took up as much room as either. The left column is the working
          half; the right is reference. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* --- Fees. First, because "what does this child pay" is the
              question this screen could not answer at all. --- */}
          <StudentFeesCard
            fees={student.fees}
            totals={student.feeTotals}
            canEdit={can.fees}
            onEdit={() => {
              setEditingFees(true);
            }}
          />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Guardians</h2>
          {can.guardians ? (
            <Button
              size="sm"
              tone="outline"
              onClick={() => {
                setGuardianDialog({ mode: 'add' });
              }}
            >
              <CreateIcon className="size-4" aria-hidden="true" />
              Add guardian
            </Button>
          ) : null}
        </div>

        {student.guardians.length === 0 ? (
          // Named as a task, not a blank space: a student nobody can be phoned
          // about is a real gap in the record, not a cosmetic one.
          <p className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            No guardian on file. Nobody can be contacted about this student.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {student.guardians.map((guardian) => (
              <li key={guardian.id} className="rounded-md border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{guardian.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {humanise(guardian.relation)}
                      {guardian.occupation === null ? '' : ` · ${guardian.occupation}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    {guardian.isPrimary ? <StatusBadge tone="success">primary</StatusBadge> : null}
                    {guardian.isFeePayer ? <StatusBadge tone="neutral">fees</StatusBadge> : null}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  {guardian.phone === null ? (
                    <p className="text-warning">No phone number</p>
                  ) : (
                    <a href={`tel:${guardian.phone}`} className="font-mono underline">
                      {guardian.phone}
                    </a>
                  )}
                  {guardian.email === null ? null : (
                    <p className="truncate text-muted-foreground">{guardian.email}</p>
                  )}
                </div>

                {/* Siblings come from the guardian link, not a surname match.
                    This is what lets one family be billed once. */}
                {guardian.siblings.length === 0 ? null : (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      Also guardian to {guardian.siblings.length}{' '}
                      {guardian.siblings.length === 1 ? 'other child' : 'other children'}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {guardian.siblings.map((sibling) => (
                        <li key={sibling.id} className="text-sm">
                          <Link href={tenantHref(`/students/${sibling.id}`)} className="underline">
                            {sibling.name}
                          </Link>
                          <span className="text-muted-foreground">
                            {sibling.className === null ? '' : ` · ${sibling.className}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {can.guardians ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={() => {
                        setGuardianDialog({ mode: 'edit', guardian });
                      }}
                    >
                      <EditIcon className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={() => {
                        setDetaching(guardian);
                      }}
                    >
                      <DeleteIcon className="size-4" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Enrolment history --- */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Enrolment history</h2>


        {student.enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enrolled in any session yet.</p>
        ) : (
          <ol className="space-y-2">
            {student.enrollments.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-border px-4 py-3 text-sm"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-medium">{entry.sessionName}</span>
                  <span>
                    {entry.className}
                    {entry.sectionName === null ? '' : ` — ${entry.sectionName}`}
                  </span>
                  {entry.rollNo === null ? null : (
                    <span className="font-mono text-xs text-muted-foreground">
                      Roll {entry.rollNo}
                    </span>
                  )}
                </div>
                <StatusBadge tone={entry.status === 'ENROLLED' ? 'success' : 'neutral'}>
                  {humanise(entry.status)}
                </StatusBadge>
              </li>
            ))}
          </ol>
        )}
      </section>

        </div>

        {/* --- Reference. Read once at admission and rarely again, so it sits
            beside the working half rather than under it. --- */}
        <section className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <h2 className="text-base font-semibold">Details</h2>
          <dl className="grid gap-x-8 gap-y-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-1">
            <Detail label="Date of birth">
              {student.dateOfBirth === null ? null : <DateDisplay value={student.dateOfBirth} />}
            </Detail>
            <Detail label="Gender">
              {student.gender === null ? null : humanise(student.gender)}
            </Detail>
            <Detail label="Admitted on">
              {student.admittedOn === null ? null : <DateDisplay value={student.admittedOn} />}
            </Detail>
            <Detail label="Blood group">{student.bloodGroup}</Detail>
            <Detail label="Religion">{student.religion}</Detail>
            <Detail label="Nationality">{student.nationality}</Detail>
            <Detail label="City">{student.city}</Detail>
            <Detail label="Address">{student.address}</Detail>
            <Detail label="Emergency contact">{student.emergencyContact}</Detail>
          </dl>
        </section>
      </div>

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
        description={
          <>
            {detaching !== undefined && detaching.siblings.length > 0 ? (
              <>
                They stay on file as guardian to {detaching.siblings.length} other{' '}
                {detaching.siblings.length === 1 ? 'child' : 'children'}. Only the link to{' '}
                <span className="text-foreground">this</span> student is removed.
              </>
            ) : (
              'The guardian record stays on file. Only the link to this student is removed.'
            )}
          </>
        }
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

/** A labelled value, with an explicit dash rather than a blank when unknown. */
/**
 * What this child is charged, and what their family agreed to pay.
 *
 * The profile endpoint has always returned `fees` and `feeTotals`; this screen
 * simply never rendered them, so the amount settled at admission could be set
 * and then never seen again except on a voucher.
 *
 * Both columns are shown, always — a structure with no discount is a row where
 * the two figures match, which is a fact worth being able to see rather than a
 * column worth hiding.
 */
function StudentFeesCard({
  fees,
  totals,
  canEdit,
  onEdit,
}: {
  readonly fees: readonly StudentFee[];
  readonly totals: FeeTotals;
  readonly canEdit: boolean;
  readonly onEdit: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Fees</h2>
        {canEdit ? (
          <Button tone="outline" size="sm" onClick={onEdit}>
            <EditIcon className="size-4" aria-hidden="true" />
            Edit fees
          </Button>
        ) : null}
      </div>

      {fees.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No fees agreed for this child. Nothing will be billed until one is set — a fee run skips
          them and says so.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Fee</th>
                <th className="px-4 py-2 text-right font-medium">Standard</th>
                <th className="px-4 py-2 text-right font-medium">Agreed</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee.feeHeadId} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{fee.name}</span>
                    {fee.discountReason === null ? null : (
                      <span className="block text-xs text-muted-foreground">
                        {fee.discountReason}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    <Money valueMinor={fee.amountMinor} />
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium tabular-nums">
                    <Money valueMinor={fee.payableMinor} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border bg-muted/40">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                  {totals.discountMinor > 0 ? 'Payable after discount' : 'Payable'}
                </th>
                <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">
                  <Money valueMinor={totals.grossMinor} />
                </td>
                <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                  <Money valueMinor={totals.payableMinor} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={empty ? 'text-muted-foreground' : undefined}>{empty ? '—' : children}</dd>
    </div>
  );
}
