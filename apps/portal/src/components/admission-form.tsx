'use client';


import {
  createStudentSchema,
  GENDERS,
  GUARDIAN_RELATIONS,
  ROUTES,
  type ClassLevelWithSections,
  type FeeHead,
  type SessionStatus,
} from '@ilm/contracts';
import {
  Button,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Money,
  SimpleSelect,
  Textarea,
  useToast,
  cn,
} from '@ilm/ui';
import {
  AccountIcon,
  AcademicsIcon,
  CalendarIcon,
  ClassIcon,
  CloseIcon,
  DesignationIcon,
  FeesIcon,
  ICON_SIZE,
  LocationIcon,
  PhoneIcon,
  SaveIcon,
  SectionIcon,
  SessionIcon,
  StudentsIcon,
  SuccessIcon,
  UndoIcon,
  WebIcon,
} from '@ilm/ui/icons';
import { minorUnits } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import {
  cloneElement,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { mutate } from '@/lib/mutate';
import { useTenantHref } from '@/lib/use-tenant-href';

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

/**
 * The religions a register in this market actually records.
 *
 * A free-text box collects "Islam", "islam", "Muslim" and "ISLAM" in the same
 * column, and the board return that has to count them becomes a spreadsheet
 * somebody cleans by hand. A short list keeps it countable; the column is plain
 * text, so widening this list is a one-line change and never a migration.
 */
const RELIGION_OPTIONS = [
  { value: 'Islam', label: 'Islam' },
  { value: 'Christianity', label: 'Christianity' },
  { value: 'Hinduism', label: 'Hinduism' },
  { value: 'Sikhism', label: 'Sikhism' },
  { value: 'Other', label: 'Other' },
] as const;

const NATIONALITY_OPTIONS = [
  { value: 'Pakistani', label: 'Pakistani' },
  { value: 'Afghan', label: 'Afghan' },
  { value: 'Indian', label: 'Indian' },
  { value: 'Bangladeshi', label: 'Bangladeshi' },
  { value: 'Other', label: 'Other' },
] as const;

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

/** A session as the picker needs it — enough to label it and mark the default. */
export interface AdmissionSession {
  readonly id: string;
  readonly name: string;
  readonly status: SessionStatus;
  readonly isCurrent: boolean;
}

export interface AdmissionFormProps {
  /** Today in the school's timezone, resolved on the server. `YYYY-MM-DD`. */
  readonly today: string;
  readonly sessionId: string | null;
  /** Every session a child may still be placed into, current one included. */
  readonly sessions: readonly AdmissionSession[];
  readonly classes: readonly ClassLevelWithSections[];
  readonly catalogue: readonly FeeHead[];
  readonly canSetFees: boolean;
}

export function AdmissionForm({
  today,
  sessionId,
  sessions,
  classes,
  catalogue,
  canSetFees,
}: AdmissionFormProps) {
  const router = useRouter();
  const tenantHref = useTenantHref();
  const toast = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [admittedOn, setAdmittedOn] = useState<string>(today);

  const [bFormNo, setBFormNo] = useState('');
  const [studentIdCard, setStudentIdCard] = useState('');
  const [religion, setReligion] = useState('');
  const [nationality, setNationality] = useState('');
  const [studentAddress, setStudentAddress] = useState('');

  // Defaults to the current session, which is the answer on almost every
  // admission. A school filling next year's classes in March picks that year
  // instead, and the class list below reloads with *that* session's sections —
  // they are different rows, so offering this year's would enrol the child into
  // the year that is ending.
  const [enrolSessionId, setEnrolSessionId] = useState(sessionId ?? '');
  const [sessionClasses, setSessionClasses] = useState(classes);
  const [loadingClasses, setLoadingClasses] = useState(false);

  const [classLevelId, setClassLevelId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('FATHER');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianCnic, setGuardianCnic] = useState('');
  const [guardianOccupation, setGuardianOccupation] = useState('');
  const [guardianAddress, setGuardianAddress] = useState('');

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

  const sections = sessionClasses.find((entry) => entry.id === classLevelId)?.sections ?? [];

  const totals = useMemo(() => {
    let gross = 0;
    let payable = 0;
    for (const row of fees) {
      gross += row.amountMinor;
      payable += row.discountedAmountMinor ?? row.amountMinor;
    }
    return { gross, payable, discount: gross - payable };
  }, [fees]);

  /**
   * Switch the year being admitted into, and reload that year's sections.
   *
   * The one request this form makes before Save, and only when somebody
   * actually changes the session — which is a few times a year, not a few times
   * a day. The alternative was shipping every session's sections on every page
   * load, paid for by every admission to serve the rare one.
   *
   * Class and section are cleared first, deliberately. A section id belongs to
   * one session; keeping the selection would leave a valid-looking dropdown
   * holding an id the new session has never heard of, and the failure would
   * arrive at Save rather than here.
   */
  function resetForm(): void {
    setFirstName('');
    setLastName('');
    setGender('');
    setDateOfBirth('');
    setAdmittedOn(today);
    setBFormNo('');
    setStudentIdCard('');
    setReligion('');
    setNationality('');
    setStudentAddress('');
    setEnrolSessionId(sessionId ?? '');
    setSessionClasses(classes);
    setClassLevelId('');
    setSectionId('');
    setGuardianName('');
    setGuardianRelation('FATHER');
    setGuardianPhone('');
    setGuardianCnic('');
    setGuardianOccupation('');
    setGuardianAddress('');
    setFees(
      catalogue.map((head) => ({
        feeHeadId: head.id,
        name: head.name,
        amountMinor: head.defaultAmountMinor,
      })),
    );
    setDiscountFor(undefined);
    setFieldErrors({});
    setFormError(undefined);
  }

  async function changeSession(next: string): Promise<void> {
    setEnrolSessionId(next);
    setClassLevelId('');
    setSectionId('');

    if (next === '') {
      setSessionClasses([]);
      return;
    }

    setLoadingClasses(true);
    try {
      const response = await fetch(
        `${ROUTES.academics.setup}?sessionId=${encodeURIComponent(next)}`,
        { credentials: 'include' },
      );
      if (!response.ok) {
        setFormError('Could not load classes for that session. Try again.');
        setSessionClasses([]);
        return;
      }
      const body = (await response.json()) as {
        data: { classes: ClassLevelWithSections[] };
      };
      setSessionClasses(body.data.classes);
    } catch {
      setFormError('Could not reach the server. Classes for that session were not loaded.');
      setSessionClasses([]);
    } finally {
      setLoadingClasses(false);
    }
  }

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
      ...(bFormNo.trim() === '' ? {} : { bFormNo }),
      ...(religion.trim() === '' ? {} : { religion }),
      ...(nationality.trim() === '' ? {} : { nationality }),
      ...(studentAddress.trim() === '' ? {} : { address: studentAddress.trim() }),
      ...(studentIdCard.trim() === ''
        ? {}
        : { custom: { studentIdCard: studentIdCard.trim() } }),
      enrollment: {
        sessionId: enrolSessionId,
        classLevelId,
        ...(sectionId === '' ? {} : { sectionId }),
      },
      guardian: {
        name: guardianName,
        relation: guardianRelation,
        phone: toE164(guardianPhone),
        address:
          guardianAddress.trim() === '' ? studentAddress.trim() : guardianAddress.trim(),
        ...(guardianCnic.trim() === '' ? {} : { cnic: guardianCnic }),
        ...(guardianOccupation.trim() === '' ? {} : { occupation: guardianOccupation }),
      },
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
    const result = await mutate<{ id: string; grNo: string; studentCode: string }>(
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
      `GR ${result.data.grNo} · Student ID ${result.data.studentCode}`,
    );
    router.push(tenantHref(`/students/${result.data.id}`));
    router.refresh();
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        noValidate
        className="space-y-8"
      >
        {formError === undefined ? null : (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {formError}
          </div>
        )}

        <AdmissionSection
          icon={StudentsIcon}
          iconClassName="bg-primary/10 text-primary"
          title="Student Information"
          description="Provide the basic details of the student."
        >
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="First name" error={fieldErrors['firstName']} required>
              <FieldIconWrap icon={AccountIcon}>
                <Input
                  value={firstName}
                  autoFocus
                  placeholder="Enter first name"
                  onChange={(event) => {
                    setFirstName(event.target.value);
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Last name" error={fieldErrors['lastName']} required>
              <FieldIconWrap icon={AccountIcon}>
                <Input
                  value={lastName}
                  placeholder="Enter last name"
                  onChange={(event) => {
                    setLastName(event.target.value);
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Gender" error={fieldErrors['gender']} required>
              <FieldIconWrap icon={StudentsIcon}>
                <SimpleSelect
                  value={gender}
                  onValueChange={setGender}
                  options={GENDER_OPTIONS}
                  placeholder="Select gender"
                  ariaLabel="Gender"
                  emptyOption={{ value: '', label: 'Select gender' }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Date of birth" error={fieldErrors['dateOfBirth']} required>
              <DatePicker value={dateOfBirth} onChange={setDateOfBirth} max={today} />
            </Field>
            <Field label="B-Form number" error={fieldErrors['bFormNo']}>
              <FieldIconWrap icon={DesignationIcon}>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Enter B-Form number"
                  value={bFormNo}
                  onChange={(event) => {
                    setBFormNo(formatCnic(event.target.value));
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="CNIC / ID Card" error={fieldErrors['custom.studentIdCard']}>
              <FieldIconWrap icon={DesignationIcon}>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Enter CNIC / ID number"
                  value={studentIdCard}
                  onChange={(event) => {
                    setStudentIdCard(formatCnic(event.target.value));
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Religion" error={fieldErrors['religion']}>
              <FieldIconWrap icon={AcademicsIcon}>
                <SimpleSelect
                  value={religion}
                  onValueChange={setReligion}
                  options={RELIGION_OPTIONS}
                  placeholder="Select religion"
                  ariaLabel="Religion"
                  emptyOption={{ value: '', label: 'Select religion' }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Nationality" error={fieldErrors['nationality']}>
              <FieldIconWrap icon={WebIcon}>
                <SimpleSelect
                  value={nationality}
                  onValueChange={setNationality}
                  options={NATIONALITY_OPTIONS}
                  placeholder="Select nationality"
                  ariaLabel="Nationality"
                  emptyOption={{ value: '', label: 'Select nationality' }}
                />
              </FieldIconWrap>
            </Field>
            <Field
              label="Address"
              error={fieldErrors['address']}
              className="md:col-span-2 xl:col-span-3"
            >
              <FieldIconWrap icon={LocationIcon} alignTop>
                <Textarea
                  rows={2}
                  autoComplete="street-address"
                  placeholder="Enter address"
                  value={studentAddress}
                  onChange={(event) => {
                    setStudentAddress(event.target.value);
                  }}
                />
              </FieldIconWrap>
            </Field>
          </div>
        </AdmissionSection>

        <AdmissionSection
          icon={AcademicsIcon}
          iconClassName="bg-primary/10 text-primary"
          title="Admission Details"
          description="Select class, session and other admission information."
        >
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Academic session"
              error={fieldErrors['enrollment.sessionId']}
              required
            >
              <FieldIconWrap icon={SessionIcon}>
                <SimpleSelect
                  value={enrolSessionId}
                  onValueChange={(next) => {
                    void changeSession(next);
                  }}
                  options={sessions.map((entry) => ({
                    value: entry.id,
                    label: sessionOptionLabel(entry),
                  }))}
                  disabled={sessions.length === 0}
                  placeholder="Select session"
                  ariaLabel="Academic session"
                />
              </FieldIconWrap>
            </Field>
            <Field label="Class" error={fieldErrors['enrollment.classLevelId']} required>
              <FieldIconWrap icon={ClassIcon}>
                <SimpleSelect
                  value={classLevelId}
                  onValueChange={(next) => {
                    setClassLevelId(next);
                    setSectionId('');
                  }}
                  options={sessionClasses.map((entry) => ({ value: entry.id, label: entry.name }))}
                  disabled={enrolSessionId === '' || loadingClasses || sessionClasses.length === 0}
                  placeholder={loadingClasses ? 'Loading…' : 'Select class'}
                  ariaLabel="Class"
                  emptyOption={{ value: '', label: 'Select class' }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Section" error={fieldErrors['enrollment.sectionId']} required>
              <FieldIconWrap icon={SectionIcon}>
                <SimpleSelect
                  value={sectionId}
                  onValueChange={setSectionId}
                  options={sections.map((entry) => ({ value: entry.id, label: entry.name }))}
                  disabled={classLevelId === '' || sections.length === 0}
                  placeholder="Select section"
                  ariaLabel="Section"
                  emptyOption={{ value: '', label: 'Select section' }}
                />
              </FieldIconWrap>
            </Field>
            <Field
              label="Date of admission"
              error={fieldErrors['admittedOn']}
              hint="Defaults to today. Backdate when entering an older record."
              required
            >
              <FieldIconWrap icon={CalendarIcon}>
                <DatePicker value={admittedOn} onChange={setAdmittedOn} />
              </FieldIconWrap>
            </Field>
          </div>
          {sessionId === null ? (
            <p className="mt-4 text-sm text-warning">
              Set up an academic session under Academics before admitting — every student needs a
              class.
            </p>
          ) : null}
        </AdmissionSection>

        <AdmissionSection
          icon={AccountIcon}
          iconClassName="bg-primary/10 text-primary"
          title="Guardian Contact"
          description="One contactable adult. Fee notices and absence messages go here."
        >
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Name" error={fieldErrors['guardian.name']} required>
              <FieldIconWrap icon={AccountIcon}>
                <Input
                  value={guardianName}
                  placeholder="Enter guardian name"
                  onChange={(event) => {
                    setGuardianName(event.target.value);
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Relation" error={fieldErrors['guardian.relation']} required>
              <FieldIconWrap icon={StudentsIcon}>
                <SimpleSelect
                  value={guardianRelation}
                  onValueChange={setGuardianRelation}
                  options={RELATION_OPTIONS}
                  ariaLabel="Relation to student"
                />
              </FieldIconWrap>
            </Field>
            <Field label="Phone" error={fieldErrors['guardian.phone']} required>
              <FieldIconWrap icon={PhoneIcon}>
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="03001234567"
                  value={guardianPhone}
                  onChange={(event) => {
                    setGuardianPhone(digitsOnly(event.target.value, 15));
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="CNIC" error={fieldErrors['guardian.cnic']} hint="Optional.">
              <FieldIconWrap icon={DesignationIcon}>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="35202-1234567-1"
                  value={guardianCnic}
                  onChange={(event) => {
                    setGuardianCnic(formatCnic(event.target.value));
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field label="Occupation" error={fieldErrors['guardian.occupation']}>
              <FieldIconWrap icon={DesignationIcon}>
                <Input
                  autoComplete="organization-title"
                  placeholder="Enter occupation"
                  value={guardianOccupation}
                  onChange={(event) => {
                    setGuardianOccupation(event.target.value);
                  }}
                />
              </FieldIconWrap>
            </Field>
            <Field
              label="Home address"
              error={fieldErrors['guardian.address']}
              hint="Uses the student address above if left blank."
              className="md:col-span-2 xl:col-span-3"
            >
              <FieldIconWrap icon={LocationIcon} alignTop>
                <Textarea
                  rows={2}
                  autoComplete="street-address"
                  placeholder="Enter home address"
                  value={guardianAddress}
                  onChange={(event) => {
                    setGuardianAddress(event.target.value);
                  }}
                />
              </FieldIconWrap>
            </Field>
          </div>
        </AdmissionSection>

        <AdmissionSection
          icon={FeesIcon}
          iconClassName="bg-primary/10 text-primary"
          title="Fees"
          description={
            catalogue.length === 0
              ? 'Review billing for this admission. Fee heads come from your school settings.'
              : 'Filled in from your fee settings. Change an amount for this child only, or give a discount.'
          }
        >
          {catalogue.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-4 text-sm">
              <p className="font-medium text-foreground">No fees are set up yet</p>
              <p className="mt-1 text-muted-foreground">
                This student can still be admitted — they just will not be billed for anything. Set
                your fees in{' '}
                <a
                  href={tenantHref('/settings/fees')}
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
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
        </AdmissionSection>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
          <Button type="button" tone="outline" size="touch" onClick={resetForm}>
            <UndoIcon className={ICON_SIZE.inline} aria-hidden />
            Reset
          </Button>
          <Button type="submit" isPending={isPending} size="touch">
            <SaveIcon className={ICON_SIZE.inline} aria-hidden />
            {isPending ? 'Saving…' : 'Save Admission'}
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

function sessionOptionLabel(entry: AdmissionSession): string {
  const spaced = entry.name.replace(/-/g, ' - ');
  return entry.isCurrent ? `${spaced} (Current)` : spaced;
}

function AdmissionSection({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
}: {
  icon: typeof StudentsIcon;
  iconClassName: string;
  title: string;
  description?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-raised">
      <div className="flex gap-4 border-b border-border px-6 py-5">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            iconClassName,
          )}
        >
          <Icon className={ICON_SIZE.nav} aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description === undefined ? null : (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}

function FieldIconWrap({
  icon: Icon,
  alignTop = false,
  children,
  ...fieldControlProps
}: {
  icon: typeof AccountIcon;
  alignTop?: boolean;
  children: ReactElement<{ className?: string; id?: string }>;
} & Record<string, unknown>) {
  return (
    <div className="relative">
      <span
        className={cn(
          'pointer-events-none absolute start-0 flex w-10 justify-center text-muted-foreground',
          alignTop ? 'top-2.5' : 'inset-y-0 items-center',
        )}
      >
        <Icon className={ICON_SIZE.inline} aria-hidden="true" />
      </span>
      {cloneElement(children, {
        ...fieldControlProps,
        className: cn('ps-10', children.props.className),
      })}
    </div>
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

/** Strip everything that is not a digit. Letters never belong in these fields. */
function digitsOnly(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '');
  return max === undefined ? digits : digits.slice(0, max);
}

/** CNIC as people write it: `35202-1234567-1`. Digits only underneath. */
function formatCnic(value: string): string {
  const digits = digitsOnly(value, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}
