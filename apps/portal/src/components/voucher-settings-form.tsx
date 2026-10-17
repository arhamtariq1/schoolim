'use client';

import {
  COPY_COUNTS,
  DEFAULT_COPY_LABELS,
  ROUTES,
  updateVoucherNumberSettingsSchema,
  updateVoucherSettingsSchema,
  type BankLogo,
  type Challan,
  type CopyCount,
  type VoucherSettings,
} from '@ilm/contracts';
import { Button, cn, Field, Input, Textarea, useToast } from '@ilm/ui';
import {
  ApproveIcon,
  FileIcon,
  ICON_SIZE,
  ImageIcon,
  PageLayoutIcon,
  SaveIcon,
  TagIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from 'react';

import { VoucherChallan } from './voucher-challan';

import { showFormValidationToast } from '@/lib/form-validation';
import { mutate } from '@/lib/mutate';

/** Printable area of an A4 sheet in the orientation this layout uses (mm). */
const PREVIEW_SHEET_MM: Record<CopyCount, { width: number; height: number }> = {
  3: { width: 281, height: 194 },
  4: { width: 194, height: 281 },
};

/** Screen height the sticky preview card's own header and padding take up. */
const PREVIEW_CHROME_PX = 180;

/**
 * Settings › Voucher Settings.
 *
 * ## Why the preview is the real component
 *
 * The form renders the actual `VoucherChallan` beside it, with a made-up child
 * on it — not a picture of one, not an approximation. A settings screen whose
 * preview is a separate rendering is a settings screen that lies the first time
 * the two drift, and this is the one document in the product that a parent
 * carries to a bank counter.
 *
 * It also shows the consumer number the school is about to print. A Kuickpay
 * prefix is a handful of digits nobody can check by reading them back; seeing
 * `15140810` appear on a challan is how somebody notices they typed 1541.
 *
 * ## Why checkboxes and not switches
 *
 * `Switch` is for a setting that takes effect the moment it is flipped. Nothing
 * here does — there is a Save button, and the challan does not change until it
 * is pressed.
 */

/** A plausible child, so the preview shows a full challan rather than dashes. */
const SAMPLE: Challan = {
  id: 'preview',
  voucherNo: 'OCT-0001',
  status: 'UNPAID',
  studentId: 'preview-student',
  studentName: 'Kaneez Fatima',
  grNo: '810',
  fatherName: 'Sohail Mustafa',
  className: 'Grade 1',
  sectionName: 'A',
  sessionId: 'preview-session',
  sessionName: '2026-2027',
  issueDate: '2026-10-01',
  dueDate: '2026-10-10',
  validTill: '2026-10-25',
  billMonths: ['2026-10-01'],
  grossMinor: 1_000_000,
  discountMinor: 0,
  waiverMinor: 0,
  arrearsMinor: 570_000,
  netPayableMinor: 1_000_000,
  totalPayableMinor: 1_570_000,
  // A non-zero surcharge, so the two payable boxes differ and a school can see
  // that they are two figures rather than a repetition.
  lateFeeMinor: 20_000,
  paidMinor: 0,
  balanceMinor: 1_570_000,
  paidOn: null,
  lateFeeAuto: true,
  cancelReason: null,
  lines: [
    {
      id: 'preview-line-1',
      feeHeadId: 'preview-head-1',
      kind: 'FEE',
      label: 'Tuition Fee - October 2026',
      billMonth: '2026-10-01',
      amountMinor: 500_000,
      discountMinor: 0,
      sortOrder: 1,
    },
    {
      id: 'preview-line-2',
      feeHeadId: 'preview-head-2',
      kind: 'FEE',
      label: 'Annual Charges',
      billMonth: null,
      amountMinor: 500_000,
      discountMinor: 0,
      sortOrder: 2,
    },
  ],
  arrears: [
    {
      sourceVoucherId: 'preview-voucher-0',
      sourceVoucherNo: 'SEP-0001',
      sourceBillMonths: ['2026-09-01'],
      amountMinor: 570_000,
    },
  ],
};

export interface VoucherSettingsFormProps {
  readonly settings: VoucherSettings;
  readonly school: {
    readonly name: string;
    readonly address?: string | undefined;
    readonly phone?: string | undefined;
    readonly logoVersion?: string | undefined;
    /** Every filled bank-logo slot, in print order. */
    readonly bankLogos?: readonly BankLogo[] | undefined;
    readonly accentColor?: string | undefined;
  };
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
  /** The bank-logo tiles, rendered inside the form's "Bank Logos" card. */
  readonly bankLogoSlot?: ReactNode;
  /**
   * Where voucher numbering stands. Absent for a viewer who cannot change it,
   * in which case the card is not shown at all.
   */
  readonly numbering?: VoucherNumbering | undefined;
  readonly numberingError?: string | undefined;
}

export interface VoucherNumbering {
  readonly configured: boolean;
  /** The next number as it will be printed, e.g. `WH-V-13`. */
  readonly next: string | null;
  readonly highestIssued: number | null;
}

export function VoucherSettingsForm({
  settings,
  school,
  canConfigure,
  error,
  bankLogoSlot,
  numbering,
  numberingError,
}: VoucherSettingsFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [draft, setDraft] = useState<VoucherSettings>(settings);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  // The next number split into the pattern a school keeps (`WH-V-`) and the
  // counter it edits (`13`). A number with no trailing digits — or none at all
  // yet — is edited whole.
  const split = splitNumber(numbering?.next ?? null);
  const [numberDigits, setNumberDigits] = useState(split?.digits ?? numbering?.next ?? '');
  const [numberError, setNumberError] = useState<string | undefined>(undefined);
  const nextNumber = split === undefined ? numberDigits.trim() : `${split.prefix}${numberDigits.trim()}`;
  const numberChanged = numbering !== undefined && nextNumber !== (numbering.next ?? '');

  /** The draft exactly as the challan — and the server — will receive it. */
  const preview: VoucherSettings = draft;

  const copyLabelError =
    fieldErrors['copyLabels'] ??
    fieldErrors['copyLabels.0'] ??
    fieldErrors['copyLabels.1'] ??
    fieldErrors['copyLabels.2'] ??
    fieldErrors['copyLabels.3'];

  function set<K extends keyof VoucherSettings>(key: K, value: VoucherSettings[K]): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setCopyLabel(index: number, value: string): void {
    setDraft((current) => ({
      ...current,
      copyLabels: current.copyLabels.map((label, at) => (at === index ? value : label)),
    }));
  }

  /**
   * Change the layout, and keep the labels in step with it.
   *
   * A fourth copy arrives named rather than blank, and the names the school
   * already chose for the first three survive going to four and back again —
   * which is what somebody does while deciding between the two.
   */
  function setCopyCount(count: CopyCount): void {
    setDraft((current) => ({
      ...current,
      copyCount: count,
      copyLabels: Array.from(
        { length: count },
        (_, index) => current.copyLabels[index] ?? DEFAULT_COPY_LABELS[count][index] ?? '',
      ),
    }));
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (isSaving || !canConfigure) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);
    setNumberError(undefined);

    const numberProblem = numberChanged
      ? updateVoucherNumberSettingsSchema.safeParse({ startingNumber: nextNumber }).error?.issues[0]
          ?.message
      : undefined;

    const parsed = updateVoucherSettingsSchema.safeParse({
      ...preview,
      // Blank inputs are absent settings, not empty strings. The schema says the
      // same of the note; the two ids are cleared here because a person who
      // empties the box has turned the thing off, not typed "".
      kuickpayPrefix: blankToNull(draft.kuickpayPrefix),
      onelinkInstitutionId: blankToNull(draft.onelinkInstitutionId),
    });

    if (!parsed.success || numberProblem !== undefined) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error?.issues ?? []) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      setNumberError(numberProblem);
      // The message lands beside the field, but that field may be under the fold
      // on a phone, so say out loud that something needs looking at.
      showFormValidationToast(toast);
      return;
    }

    setIsSaving(true);

    // The number first: it is the one the server can still refuse (lower than
    // one already issued), and refusing it should leave the layout unsaved too
    // rather than half the form applied.
    if (numberChanged) {
      const saved = await mutate(ROUTES.school.voucherNumber, 'PUT', { startingNumber: nextNumber });
      if (!saved.ok) {
        setIsSaving(false);
        setNumberError(saved.fieldErrors['startingNumber'] ?? saved.message);
        showFormValidationToast(toast);
        return;
      }
    }

    const result = await mutate<VoucherSettings>(ROUTES.school.voucherSettings, 'PUT', parsed.data);
    setIsSaving(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      setFormError(result.message);
      return;
    }

    // Re-seeded from the response rather than from the draft: the server clears
    // the id of a channel that was turned off, and a form that kept showing it
    // would offer to re-save what was just discarded.
    setDraft(result.data);
    toast.success('Challan settings saved.');
    router.refresh();
  }

  return (
    <form
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
      onSubmit={(event) => void save(event)}
      noValidate
    >
      {/* Denser than the app default: six cards share one column beside the
          preview, and at base size they push the Save button off the screen. */}
      <div className="space-y-4 text-sm [&_input]:h-9 [&_input]:text-sm [&_label]:text-xs [&_textarea]:text-sm">
        {error === undefined ? null : <Alert>{error}</Alert>}
        {formError === undefined ? null : <Alert>{formError}</Alert>}

        {/* One disabled fieldset rather than a prop on every control: a
            read-only viewer and a save in flight are the same state as far as
            the inputs are concerned. */}
        <fieldset disabled={!canConfigure || isSaving} className="space-y-4">
          {numbering === undefined ? null : (
            <SettingsCard
              icon={<FileIcon className={ICON_SIZE.nav} aria-hidden />}
              title="Voucher Numbering"
              description="Set the starting number for new vouchers."
            >
              {numberingError === undefined ? null : <Alert>{numberingError}</Alert>}
              <Field
                label="Next voucher number"
                required
                error={numberError}
                hint={
                  numbering.highestIssued === null
                    ? numbering.configured
                      ? undefined
                      : 'No vouchers are issued until this is set — for a new school, 1.'
                    : `Highest number issued so far: ${String(numbering.highestIssued)}. Enter a higher number.`
                }
              >
                {split === undefined ? (
                  <Input
                    autoComplete="off"
                    maxLength={40}
                    placeholder="e.g. FV-000001"
                    value={numberDigits}
                    onChange={(event) => {
                      setNumberDigits(event.target.value);
                      setNumberError(undefined);
                    }}
                  />
                ) : (
                  <PrefixedInput
                    prefix={split.prefix}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={20}
                    value={numberDigits}
                    onChange={(event) => {
                      setNumberDigits(event.target.value.replace(/\D/g, ''));
                      setNumberError(undefined);
                    }}
                  />
                )}
              </Field>
            </SettingsCard>
          )}

          <SettingsCard
            icon={<PageLayoutIcon className={ICON_SIZE.nav} aria-hidden />}
            title="Page Layout"
            description="Select how many copies to print per page."
          >
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Copies per page">
              {COPY_COUNTS.map((count) => (
                <LayoutChoice
                  key={count}
                  count={count}
                  checked={draft.copyCount === count}
                  onSelect={() => {
                    setCopyCount(count);
                  }}
                />
              ))}
            </div>
          </SettingsCard>

          <SettingsCard
            icon={<TagIcon className={ICON_SIZE.nav} aria-hidden />}
            title="Copy Names"
            description="Set the name for each copy. (Most schools use School, Bank, Student)"
          >
            <div
              className={cn(
                'grid grid-cols-1 gap-3',
                draft.copyCount === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
              )}
            >
              {draft.copyLabels.map((label, index) => (
                <Field key={index} label={COPY_FIELD_LABELS[index] ?? `Copy ${String(index + 1)} name`}>
                  <Input
                    value={label}
                    maxLength={40}
                    aria-invalid={copyLabelError !== undefined}
                    className={cn('border-transparent', COPY_TINTS[index] ?? COPY_TINTS[3])}
                    onChange={(event) => {
                      setCopyLabel(index, event.target.value);
                    }}
                  />
                </Field>
              ))}
            </div>
            {copyLabelError === undefined ? null : (
              <p role="alert" className="text-xs text-danger">
                {copyLabelError}
              </p>
            )}
          </SettingsCard>
        </fieldset>

        {bankLogoSlot === undefined ? null : (
          <SettingsCard
            icon={<ImageIcon className={ICON_SIZE.nav} aria-hidden />}
            title="Bank Logos"
            description="Printed in one row at the footer of every copy."
          >
            {bankLogoSlot}
          </SettingsCard>
        )}

        <fieldset disabled={!canConfigure || isSaving} className="space-y-4">
          <SettingsCard
            icon={<FileIcon className={ICON_SIZE.nav} aria-hidden />}
            title="Note Under the Signature"
            description="Optional note to print under the signatures."
          >
            <Field label="Note" error={fieldErrors['footerNote']}>
              <Textarea
                rows={2}
                maxLength={FOOTER_NOTE_MAX}
                value={draft.footerNote ?? ''}
                placeholder="Fees paid after the due date attract a surcharge."
                onChange={(event) => {
                  set('footerNote', event.target.value === '' ? null : event.target.value);
                }}
              />
            </Field>
            <p className="text-end text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {String((draft.footerNote ?? '').length)}/{String(FOOTER_NOTE_MAX)}
            </p>
          </SettingsCard>
        </fieldset>

        {canConfigure ? (
          <Button type="submit" isPending={isSaving} className="w-full sm:w-auto">
            <SaveIcon className={ICON_SIZE.inline} aria-hidden />
            Save Challan
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only an owner or principal can change the challan.
          </p>
        )}
      </div>

      {/* `no-print`: the print stylesheet promotes any `.voucher-challan` on the
          page to the sheet, and a settings screen must not be able to emit a
          challan for a child who does not exist. */}
      <div className="no-print xl:sticky xl:top-4">
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-raised">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ViewIcon className={ICON_SIZE.nav} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground">Live Preview</h2>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  How the challan will look with the current settings.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-muted/40 p-3 sm:p-4">
            <ChallanLivePreview copyCount={preview.copyCount}>
              <VoucherChallan voucher={SAMPLE} school={school} settings={preview} preview />
            </ChallanLivePreview>
          </div>
        </section>
      </div>
    </form>
  );
}

/**
 * Scales the real A4 challan sheet to the full width of the preview pane.
 *
 * `transform: scale` keeps print proportions honest; the outer height is
 * collapsed to the scaled size so the card does not leave empty side gutters
 * or a tall blank strip under the sheet. Text is not selectable — this is a
 * picture of a challan, not a document to copy from.
 */
function ChallanLivePreview({
  copyCount,
  children,
}: {
  readonly copyCount: CopyCount;
  readonly children: ReactNode;
}) {
  const sheet = PREVIEW_SHEET_MM[copyCount];
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) {
      return;
    }

    const paperWidthPx = (sheet.width / 25.4) * 96;
    const paperHeightPx = (sheet.height / 25.4) * 96;
    const target = frame;

    function measure(): void {
      const width = target.getBoundingClientRect().width;
      if (width <= 0 || paperWidthPx <= 0) {
        return;
      }
      // The whole sheet, always: fit the pane's width and the screen's height,
      // whichever is tighter, so a portrait (4-copy) page is seen complete
      // rather than running off the bottom.
      const availableHeight = Math.max(window.innerHeight - PREVIEW_CHROME_PX, 240);
      setScale(Math.min((width - 2) / paperWidthPx, availableHeight / paperHeightPx));
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [sheet.width, sheet.height]);

  const scaledWidthPx = ((sheet.width / 25.4) * 96) * scale;
  const scaledHeightPx = ((sheet.height / 25.4) * 96) * scale;

  return (
    <div ref={frameRef} className="flex w-full justify-center">
      <div
        className="relative overflow-hidden rounded-lg border border-border bg-white"
        style={{ width: scaledWidthPx, height: scaledHeightPx }}
      >
        <div
          className="origin-top-left select-none"
          style={{
            width: `${String(sheet.width)}mm`,
            height: `${String(sheet.height)}mm`,
            transform: `scale(${String(scale)})`,
          }}
        >
          <div className="pointer-events-none box-border h-full w-full select-none p-[2mm] [&_*]:select-none [&_.voucher-challan]:h-full [&_.voucher-challan]:w-full">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One of the two page layouts, drawn rather than described.
 *
 * "Three copies" and "four copies" say nothing about what comes out of the
 * printer — a sheet with three strips and a sheet quartered are different
 * documents to whoever has to cut them up. A miniature of the sheet answers
 * the question the words do not.
 */
function LayoutChoice({
  count,
  checked,
  onSelect,
}: {
  readonly count: CopyCount;
  readonly checked: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
        'has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring',
        checked
          ? 'border-primary bg-primary/5'
          : 'border-border bg-background hover:border-primary/40',
      )}
    >
      <input
        type="radio"
        name="copyCount"
        className="sr-only"
        checked={checked}
        onChange={onSelect}
      />

      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
        )}
      >
        {checked ? <ApproveIcon className="size-3" aria-hidden /> : null}
      </span>

      {/* A4 proportions, and the sheet turns with the layout — three copies go
          across a landscape page, four in a portrait square. Which way up the
          paper goes is half of what is being chosen here. */}
      <span
        aria-hidden
        className={cn(
          'grid h-8 w-12 shrink-0 gap-0.5 rounded-sm border border-border bg-card p-0.5',
          count === 4 ? 'grid-cols-2' : 'grid-cols-3',
        )}
      >
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={cn(
              'rounded-xs',
              checked ? 'bg-primary/70' : 'bg-muted-foreground/25',
            )}
          />
        ))}
      </span>

      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{count} Copies</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {count === 3 ? 'Across a landscape sheet' : 'In a portrait square'}
        </span>
      </span>
    </label>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  children,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-raised">
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description === undefined ? null : (
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function Alert({ children }: { readonly children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
    >
      {children}
    </p>
  );
}

/**
 * An input with a fixed lead-in the person does not type — the voucher
 * number's pattern, so only the counter is edited.
 *
 * Takes every input prop so `<Field>` can hand it the id and the
 * `aria-describedby` that link it to its label and hint.
 */
function PrefixedInput({
  prefix,
  className,
  ...props
}: ComponentProps<typeof Input> & { readonly prefix: string }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <span className="flex shrink-0 items-center border-e border-input bg-muted px-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
        {prefix}
      </span>
      <Input
        className={cn('rounded-none border-0 font-mono shadow-none focus-visible:ring-0', className)}
        {...props}
      />
    </div>
  );
}

/** `WH-V-13` → `{ prefix: 'WH-V-', digits: '13' }`. Undefined when there is no counter to split off. */
function splitNumber(value: string | null): { prefix: string; digits: string } | undefined {
  const match = value === null ? null : /^(.*?)(\d+)$/.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined || match[1] === '') {
    return undefined;
  }
  return { prefix: match[1], digits: match[2] };
}

/** The schema's own ceiling for the note, shown as a running count. */
const FOOTER_NOTE_MAX = 400;

const COPY_FIELD_LABELS = ['School copy name', 'Bank copy name', 'Student copy name', 'Fourth copy name'];

/**
 * A pale wash per copy, so the three names read as three different slips at a
 * glance. Semantic tokens only — they follow dark mode and the school's palette.
 */
const COPY_TINTS = ['bg-success/10', 'bg-info/10', 'bg-warning/10', 'bg-muted'];

function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value.trim();
}
