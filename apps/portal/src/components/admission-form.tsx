'use client';

import {
  createStudentSchema,
  GENDERS,
  GUARDIAN_RELATIONS,
  ROUTES,
  type ClassLevelWithSections,
  type FeeHead,
} from '@ilm/contracts';
import { Button, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Field, Input, Money, SimpleSelect, useToast } from '@ilm/ui';
import { CloseIcon, ICON_SIZE, SuccessIcon } from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { mutate } from '@/lib/mutate';

/**
 * The admission form.
 *
 * Four sections down one page — child, class, guardian, fees — rather than a
 * tabbed wizard. Tabs are right when steps depend on each other; here they do
 * not, and tabs would hide the fee total behind a click at exactly the moment a
 * parent is sitting across the desk asking what it comes to.
 *
 * ## Fees
 *
 * The grid is filled from the school's catalogue (Settings › Fees) the moment
 * the page loads. Nobody retypes a price per child. A discount is entered as
 * **the amount the family will actually pay**, not a percentage and not a
 * reduction, because that is the sentence a principal says out loud: "we agreed
 * ten thousand instead of twenty-five". Storing the sentence removes an
 * arithmetic step that can be got wrong in either direction.
 *
 * The total is computed here for immediacy and computed again on the server on
 * save. The server's is authoritative; this one exists so the number moves the
 * instant a discount is applied.
 */

const GENDER_OPTIONS = GENDERS.map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
}));

const RELATION_OPTIONS = GUARDIAN_RELATIONS.map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
}));

/** One row of the fee grid while it is being edited. */
interface FeeRow {
  readonly feeHeadId: string;
  readonly name: string;
  readonly amountMinor: number;
  /** The agreed price when a discount was given. Undefined means full price. */
  readonly discountedAmountMinor?: number;
  readonly discountReason?: string;
}

export interface AdmissionFormProps {
  /** Today in the school's timezone, resolved on the server. `YYYY-MM-DD`. */
  readonly today: string;
  readonly sessionId: string | null;
  readonly classes: readonly ClassLevelWithSections[];
  readonly catalogue: readonly FeeHead[];
  readonly canSetFees: boolean;
}

export function AdmissionForm({
  today,
  sessionId,
  classes,
  catalogue,
  canSetFees,
}: AdmissionFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [admittedOn, setAdmittedOn] = useState<string>(today);

  const [classLevelId, setClassLevelId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('FATHER');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianCnic, setGuardianCnic] = useState('');

  const [fees, setFees] = useState<FeeRow[]>(() =>
    catalogue.map((head) => ({
      feeHeadId: head.id,
      name: head.name,
      amountMinor: head.defaultAmountMinor,
    })),
  );
  const [discountFor, setDiscountFor] = useState<FeeRow | undefined>(undefined);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  const sections = classes.find((entry) => entry.id === classLevelId)?.sections ?? [];

  const totals = useMemo(() => {
    let gross = 0;
    let payable = 0;
    for (const row of fees) {
      gross += row.amountMinor;
      payable += row.discountedAmountMinor ?? row.amountMinor;
    }
    return { gross, payable, discount: gross - payable };
  }, [fees]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const parsed = createStudentSchema.safeParse({
      firstName,
      lastName,
      ...(gender === '' ? {} : { gender }),
      ...(dateOfBirth === '' ? {} : { dateOfBirth }),
      ...(admittedOn === '' ? {} : { admittedOn }),
      ...(classLevelId === '' || sessionId === null
        ? {}
        : {
            enrollment: {
              sessionId,
              classLevelId,
              ...(sectionId === '' ? {} : { sectionId }),
            },
          }),
      ...(guardianName.trim() === ''
        ? {}
        : {
            guardian: {
              name: guardianName,
              relation: guardianRelation,
              ...(guardianPhone.trim() === '' ? {} : { phone: toE164(guardianPhone) }),
              ...(guardianCnic.trim() === '' ? {} : { cnic: guardianCnic }),
            },
          }),
      // Always sent, even untouched: the server would otherwise fall back to
      // the catalogue, and if a head were turned off between this page loading
      // and Save being pressed, the child would silently be admitted on a
      // different structure from the one on screen.
      fees: fees.map((row) => ({
        feeHeadId: row.feeHeadId,
        amountMinor: row.amountMinor,
        ...(row.discountedAmountMinor === undefined
          ? {}
          : { discountedAmountMinor: row.discountedAmountMinor }),
        ...(row.discountReason === undefined || row.discountReason === ''
          ? {}
          : { discountReason: row.discountReason }),
      })),
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      setFormError('Check the highlighted fields.');
      return;
    }

    setIsPending(true);
    const result = await mutate<{ data: { id: string; grNo: string; studentCode: string } }>(
      ROUTES.students.create,
      'POST',
      parsed.data,
    );
    setIsPending(false);

    if (!result.ok) {
      setFormError(result.message);
      setFieldErrors(result.fieldErrors);
      return;
    }

    toast.success(
      `${firstName} ${lastName} admitted`,
      `GR ${result.data.data.grNo} · Student ID ${result.data.data.studentCode}`,
    );
    router.push(`/students/${result.data.data.id}`);
    router.refresh();
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
        className="space-y-6"
      >
        {formError === undefined ? null : (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        <Section title="Student" description="What goes on the register.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" error={fieldErrors['firstName']} required>
              <Input
                value={firstName}
                autoFocus
                onChange={(event) => {
                  setFirstName(event.target.value);
                }}
              />
            </Field>
            <Field label="Last name" error={fieldErrors['lastName']} required>
              <Input
                value={lastName}
                onChange={(event) => {
                  setLastName(event.target.value);
                }}
              />
            </Field>
            <Field label="Gender" error={fieldErrors['gender']}>
              <SimpleSelect
                value={gender}
                onValueChange={setGender}
                options={GENDER_OPTIONS}
                placeholder="Select"
                ariaLabel="Gender"
                emptyOption={{ value: '', label: 'Not recorded' }}
              />
            </Field>
            <Field label="Date of birth" error={fieldErrors['dateOfBirth']}>
              <DatePicker
                value={dateOfBirth}
                onChange={setDateOfBirth}
              />
            </Field>
            <Field
              label="Date of admission"
              error={fieldErrors['admittedOn']}
              hint="Defaults to today. Backdate it when entering an older record."
              required
            >
              <DatePicker
                value={admittedOn}
                onChange={setAdmittedOn}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Class"
          description={
            sessionId === null
              ? 'No academic session is set up yet, so this student is admitted without a class. Add one from Academics and place them later.'
              : 'Can be left unplaced and assigned later.'
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class" error={fieldErrors['enrollment.classLevelId']}>
              <SimpleSelect
                value={classLevelId}
                onValueChange={(next) => {
                  setClassLevelId(next);
                  // A section from the previous class is not a section of this
                  // one, and leaving it selected sends a mismatched pair.
                  setSectionId('');
                }}
                options={classes.map((entry) => ({ value: entry.id, label: entry.name }))}
                disabled={sessionId === null}
                ariaLabel="Class"
                emptyOption={{ value: '', label: 'Not placed yet' }}
              />
            </Field>
            <Field label="Section" error={fieldErrors['enrollment.sectionId']}>
              <SimpleSelect
                value={sectionId}
                onValueChange={setSectionId}
                options={sections.map((entry) => ({ value: entry.id, label: entry.name }))}
                disabled={classLevelId === ''}
                ariaLabel="Section"
                emptyOption={{ value: '', label: 'Not assigned' }}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Guardian"
          description="One contactable adult. Fee notices and absence messages go here."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={fieldErrors['guardian.name']}>
              <Input
                value={guardianName}
                onChange={(event) => {
                  setGuardianName(event.target.value);
                }}
              />
            </Field>
            <Field label="Relation" error={fieldErrors['guardian.relation']}>
              <SimpleSelect
                value={guardianRelation}
                onValueChange={setGuardianRelation}
                options={RELATION_OPTIONS}
                ariaLabel="Relation to student"
              />
            </Field>
            <Field
              label="Phone"
              error={fieldErrors['guardian.phone']}
              hint="Start with 0 and we will add +92."
            >
              <Input
                type="tel"
                inputMode="tel"
                placeholder="0300 1234567"
                value={guardianPhone}
                onChange={(event) => {
                  setGuardianPhone(event.target.value);
                }}
              />
            </Field>
            <Field label="CNIC" error={fieldErrors['guardian.cnic']}>
              <Input
                value={guardianCnic}
                placeholder="35202-1234567-1"
                onChange={(event) => {
                  setGuardianCnic(event.target.value);
                }}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Fees"
          description={
            catalogue.length === 0
              ? undefined
              : 'Filled in from your fee settings. Change an amount for this child only, or give a discount.'
          }
        >
          {catalogue.length === 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">No fees are set up yet</p>
              <p className="mt-1 text-muted-foreground">
                This student can still be admitted — they just will not be billed for anything. Set
                your fees in{' '}
                <a href="/settings/fees" className="font-medium text-primary hover:underline">
                  Settings › Fees
                </a>
                .
              </p>
            </div>
          ) : (
            <FeeGrid
              rows={fees}
              canDiscount={canSetFees}
              onAmountChange={(feeHeadId, amountMinor) => {
                setFees((current) =>
                  current.map((row) =>
                    row.feeHeadId === feeHeadId ? { ...row, amountMinor } : row,
                  ),
                );
              }}
              onRequestDiscount={setDiscountFor}
              onClearDiscount={(feeHeadId) => {
                setFees((current) =>
                  current.map((row) => {
                    if (row.feeHeadId !== feeHeadId) {
                      return row;
                    }
                    const { discountedAmountMinor, discountReason, ...rest } = row;
                    void discountedAmountMinor;
                    void discountReason;
                    return rest;
                  }),
                );
              }}
              totals={totals}
            />
          )}
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            tone="outline"
            size="touch"
            onClick={() => {
              router.push('/students');
            }}
          >
            Cancel
          </Button>
          <Button type="submit" isPending={isPending} size="touch">
            {isPending ? 'Admitting…' : 'Admit student'}
          </Button>
        </div>
      </form>

      <DiscountDialog
        row={discountFor}
        onClose={() => {
          setDiscountFor(undefined);
        }}
        onApply={(feeHeadId, discountedAmountMinor, reason) => {
          setFees((current) =>
            current.map((row) =>
              row.feeHeadId === feeHeadId
                ? {
                    ...row,
                    discountedAmountMinor,
                    ...(reason === '' ? {} : { discountReason: reason }),
                  }
                : row,
            ),
          );
          setDiscountFor(undefined);
        }}
      />
    </>
  );
}

/** A titled block. Four of these read better than one 30-field form. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      {description === undefined ? null : (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FeeGrid({
  rows,
  canDiscount,
  onAmountChange,
  onRequestDiscount,
  onClearDiscount,
  totals,
}: {
  rows: readonly FeeRow[];
  canDiscount: boolean;
  onAmountChange: (feeHeadId: string, amountMinor: number) => void;
  onRequestDiscount: (row: FeeRow) => void;
  onClearDiscount: (feeHeadId: string) => void;
  totals: { gross: number; payable: number; discount: number };
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => {
          const discounted = row.discountedAmountMinor !== undefined;
          return (
            <div key={row.feeHeadId} className="space-y-1.5">
              <label
                htmlFor={`fee-${row.feeHeadId}`}
                className="block text-sm font-medium text-foreground"
              >
                {row.name}
              </label>
              <Input
                id={`fee-${row.feeHeadId}`}
                inputMode="decimal"
                className="text-right font-mono tabular-nums"
                value={(row.amountMinor / 100).toFixed(2)}
                onChange={(event) => {
                  const rupees = Number(event.target.value);
                  if (Number.isFinite(rupees) && rupees >= 0) {
                    onAmountChange(row.feeHeadId, Math.trunc(rupees * 100 + 0.5));
                  }
                }}
              />

              {discounted ? (
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground line-through">
                    <Money valueMinor={minorUnits(row.amountMinor)} />
                  </span>
                  <span className="font-medium text-success">
                    <Money valueMinor={minorUnits(row.discountedAmountMinor ?? 0)} />
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground underline hover:text-danger"
                    onClick={() => {
                      onClearDiscount(row.feeHeadId);
                    }}
                  >
                    Remove
                  </button>
                </p>
              ) : canDiscount ? (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    onRequestDiscount(row);
                  }}
                >
                  Apply a discount
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* The number the parent is quoted. It belongs at the bottom of the fees,
          not on a different tab. */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4">
        <div className="space-y-0.5 text-sm">
          <p className="text-muted-foreground">
            Standard <Money valueMinor={minorUnits(totals.gross)} withSymbol />
          </p>
          {totals.discount > 0 ? (
            <p className="text-success">
              Discount −<Money valueMinor={minorUnits(totals.discount)} withSymbol />
            </p>
          ) : null}
        </div>
        <div className="text-end">
          <p className="text-xs text-muted-foreground">Total payable</p>
          <p>
            <Money valueMinor={minorUnits(totals.payable)} withSymbol className="text-xl" />
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Give a discount on one fee.
 *
 * The field is the **agreed price**, not a percentage and not a reduction —
 * that is how the conversation actually goes, and it removes a subtraction that
 * can be got wrong. The saving is shown back immediately so a mistyped figure
 * is obvious before it is applied.
 */
function DiscountDialog({
  row,
  onClose,
  onApply,
}: {
  row: FeeRow | undefined;
  onClose: () => void;
  onApply: (feeHeadId: string, discountedAmountMinor: number, reason: string) => void;
}) {
  const [agreed, setAgreed] = useState('');
  const [reason, setReason] = useState('');

  const amountMinor = row?.amountMinor ?? 0;
  const agreedRupees = Number(agreed);
  const isNumeric = agreed !== '' && Number.isFinite(agreedRupees) && agreedRupees >= 0;
  const agreedMinor = isNumeric ? Math.trunc(agreedRupees * 100 + 0.5) : 0;
  const tooHigh = isNumeric && agreedMinor > amountMinor;

  return (
    <Dialog
      open={row !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setAgreed('');
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discount on {row?.name ?? ''}</DialogTitle>
          <DialogDescription>
            Enter what this family will actually pay — not the reduction.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Standard amount </span>
            <Money valueMinor={minorUnits(amountMinor)} withSymbol className="font-medium" />
          </div>

          <Field
            label="Agreed amount (PKR)"
            required
            error={tooHigh ? 'That is more than the fee itself.' : undefined}
          >
            <Input
              inputMode="decimal"
              autoFocus
              placeholder="10000"
              className="text-right font-mono tabular-nums"
              value={agreed}
              onChange={(event) => {
                setAgreed(event.target.value);
              }}
            />
          </Field>

          <Field label="Reason" hint="Sibling, staff child, hardship — whatever was agreed.">
            <Input
              value={reason}
              placeholder="Sibling discount"
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </Field>

          {isNumeric && !tooHigh ? (
            <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
              <SuccessIcon className={ICON_SIZE.inline} aria-hidden />
              Saves <Money valueMinor={minorUnits(amountMinor - agreedMinor)} withSymbol />
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            tone="outline"
            onClick={() => {
              setAgreed('');
              setReason('');
              onClose();
            }}
          >
            <CloseIcon className={ICON_SIZE.inline} aria-hidden />
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!isNumeric || tooHigh}
            onClick={() => {
              if (row !== undefined && isNumeric && !tooHigh) {
                onApply(row.feeHeadId, agreedMinor, reason.trim());
                setAgreed('');
                setReason('');
              }
            }}
          >
            Apply discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Input assistance, not validation.
 *
 * Pakistani numbers are written `0300 1234567` on every sign and letterhead,
 * and `phoneSchema` requires E.164. Rejecting the form people know is a bad
 * first impression, so the common local shape is converted and anything else is
 * passed through for zod to judge.
 */
function toE164(input: string): string {
  const digits = input.replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `+92${digits.slice(1)}`;
  }
  return digits;
}
