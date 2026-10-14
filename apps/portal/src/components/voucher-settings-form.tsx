'use client';

import {
  COPY_COUNTS,
  DEFAULT_COPY_LABELS,
  DEFAULT_KUICKPAY_CHANNELS,
  kuickpayConsumerNo,
  onelinkConsumerNo,
  ROUTES,
  updateVoucherSettingsSchema,
  type Challan,
  type CopyCount,
  type VoucherSettings,
} from '@ilm/contracts';
import { Button, CheckboxField, cn, Field, Input, Textarea, useToast } from '@ilm/ui';
import {
  ApproveIcon,
  ExportIcon,
  ICON_SIZE,
  LinkIcon,
  ListChecksIcon,
  PageLayoutIcon,
  QuickpayIcon,
  SaveIcon,
  TagIcon,
  ViewIcon,
} from '@ilm/ui/icons';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useRef,
  useState,
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

/**
 * Settings › Fee challan.
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
    readonly bankLogoVersion?: string | undefined;
    readonly accentColor?: string | undefined;
  };
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
  /** Bank logo card — sits under the live preview in the right column. */
  readonly bankLogoSlot?: ReactNode;
}

export function VoucherSettingsForm({
  settings,
  school,
  canConfigure,
  error,
  bankLogoSlot,
}: VoucherSettingsFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [draft, setDraft] = useState<VoucherSettings>(settings);
  // Held as text, not as an array: mid-edit a channel list legitimately has a
  // blank line in it, and normalising on every keystroke would delete the line
  // somebody was about to type into.
  const [channelText, setChannelText] = useState(() => settings.kuickpayChannels.join('\n'));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [focusedCopy, setFocusedCopy] = useState(0);

  /** The draft exactly as the challan — and the server — will receive it. */
  const preview: VoucherSettings = {
    ...draft,
    kuickpayChannels: toChannels(channelText),
  };

  const [printRoot, setPrintRoot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPrintRoot(document.body);
  }, []);

  const [isDownloading, setIsDownloading] = useState(false);

  /**
   * Renders the sheet to a real A4 PDF: three copies across (landscape) or four
   * in a square (portrait). The libraries load on click, so they cost the
   * settings page nothing until a school actually downloads one.
   */
  async function downloadChallan(): Promise<void> {
    const root = document.querySelector<HTMLElement>('.challan-print-root');
    if (root === null) {
      return;
    }
    setIsDownloading(true);
    const portrait = preview.copyCount === 4;
    // A4 minus 8mm margins, in CSS pixels at 96dpi.
    const widthPx = portrait ? 733 : 1062;
    const saved = root.getAttribute('style');
    root.setAttribute(
      'style',
      `display:block;position:fixed;top:0;left:-10000px;width:${String(widthPx)}px;background:#fff`,
    );
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(root, { scale: 3, backgroundColor: '#ffffff' });
      const pdf = new jsPDF({ orientation: portrait ? 'portrait' : 'landscape', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth() - 16;
      const pageH = pdf.internal.pageSize.getHeight() - 16;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 8, 8, pageW, pageH);
      pdf.save(`fee-challan-${String(preview.copyCount)}-copies.pdf`);
    } catch {
      toast.error('Could not create the PDF. Please try again.');
    } finally {
      if (saved === null) {
        root.removeAttribute('style');
      } else {
        root.setAttribute('style', saved);
      }
      setIsDownloading(false);
    }
  }

  const sampleKuickpay = kuickpayConsumerNo(preview, SAMPLE.grNo);
  const sampleOnelink = onelinkConsumerNo(preview, SAMPLE.grNo);
  const hasLogo = school.logoVersion !== undefined;
  const copyLabelError =
    fieldErrors['copyLabels'] ??
    fieldErrors['copyLabels.0'] ??
    fieldErrors['copyLabels.1'] ??
    fieldErrors['copyLabels.2'];
  const activeCopy = Math.min(focusedCopy, draft.copyLabels.length - 1);

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
    setFocusedCopy((current) => Math.min(current, count - 1));
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (isSaving || !canConfigure) {
      return;
    }

    setFieldErrors({});
    setFormError(undefined);

    const parsed = updateVoucherSettingsSchema.safeParse({
      ...preview,
      // Blank inputs are absent settings, not empty strings. The schema says the
      // same of the note; the two ids are cleared here because a person who
      // empties the box has turned the thing off, not typed "".
      kuickpayPrefix: blankToNull(draft.kuickpayPrefix),
      onelinkInstitutionId: blankToNull(draft.onelinkInstitutionId),
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[issue.path.join('.')] = issue.message;
      }
      setFieldErrors(next);
      // The message lands beside the field, but that field may be under the fold
      // on a phone, so say out loud that something needs looking at.
      showFormValidationToast(toast);
      return;
    }

    setIsSaving(true);
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
    setChannelText(result.data.kuickpayChannels.join('\n'));
    toast.success('Challan settings saved.');
    router.refresh();
  }

  return (
    <form
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
      onSubmit={(event) => void save(event)}
      noValidate
    >
      <div className="space-y-4">
        {error === undefined ? null : <Alert>{error}</Alert>}
        {formError === undefined ? null : <Alert>{formError}</Alert>}

        {/* One disabled fieldset rather than a prop on every control: a
            read-only viewer and a save in flight are the same state as far as
            the inputs are concerned. */}
        <fieldset disabled={!canConfigure || isSaving} className="space-y-4">
          <SettingsCard
            icon={<PageLayoutIcon className={ICON_SIZE.nav} aria-hidden />}
            title="Page Layout"
            description="Copies per sheet. A4 either way. Three across a landscape sheet; four in a portrait square."
          >
            <div className="grid grid-cols-2 gap-3">
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
            description="One name per copy, in order. Most schools keep School, Bank, Student."
          >
            <div className="flex flex-col gap-2">
              {draft.copyLabels.map((label, index) => {
                const selected = index === activeCopy;
                return (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:border-primary/40',
                    )}
                  >
                    <button
                      type="button"
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-primary"
                      aria-label={`Focus preview on copy ${String(index + 1)}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setFocusedCopy(index);
                      }}
                    >
                      {selected ? (
                        <ApproveIcon className="size-3.5" aria-hidden />
                      ) : (
                        <span className="size-2 rounded-full bg-transparent" aria-hidden />
                      )}
                    </button>
                    <Input
                      value={label}
                      maxLength={40}
                      aria-label={`Copy ${String(index + 1)} name`}
                      aria-invalid={copyLabelError !== undefined}
                      className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                      onFocus={() => {
                        setFocusedCopy(index);
                      }}
                      onChange={(event) => {
                        setCopyLabel(index, event.target.value);
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {copyLabelError === undefined ? null : (
              <p role="alert" className="text-xs text-danger">
                {copyLabelError}
              </p>
            )}
          </SettingsCard>

          <SettingsCard
            icon={<ListChecksIcon className={ICON_SIZE.nav} aria-hidden />}
            title="What it shows"
          >
            <CheckboxField
              label="Print the school logo"
              hint={
                hasLogo ? 'Top-left of every copy.' : 'Upload one under Settings › School first.'
              }
              checked={draft.showLogo && hasLogo}
              disabled={!hasLogo}
              onCheckedChange={(next) => {
                set('showLogo', next === true);
              }}
            />

            <Field
              label="Bank name"
              hint="Printed at the foot of every copy, beside the bank’s mark."
              error={fieldErrors['bankName']}
            >
              <Input
                maxLength={60}
                placeholder="Meezan Bank Ltd."
                value={draft.bankName ?? ''}
                onChange={(event) => {
                  set('bankName', event.target.value === '' ? null : event.target.value);
                }}
              />
            </Field>

            <Field
              label="Note under the signature"
              hint="Optional. A bank account, office timings, a reminder about the surcharge."
              error={fieldErrors['footerNote']}
            >
              <Textarea
                rows={2}
                maxLength={400}
                value={draft.footerNote ?? ''}
                placeholder="Fees paid after the due date attract a surcharge."
                onChange={(event) => {
                  set('footerNote', event.target.value === '' ? null : event.target.value);
                }}
              />
            </Field>
          </SettingsCard>

          <SettingsCard
            icon={<QuickpayIcon className={ICON_SIZE.nav} aria-hidden />}
            title="Kuickpay"
          >
            <CheckboxField
              label="Print a Kuickpay ID"
              hint="Parents pay in cash at any outlet on the list below."
              checked={draft.kuickpayEnabled}
              onCheckedChange={(next) => {
                const on = next === true;
                set('kuickpayEnabled', on);
                if (!on) {
                  // 1LINK prints behind the Kuickpay number, so it cannot
                  // outlive it. Turning it off here rather than letting the save
                  // be refused is the difference between a rule and a rejection.
                  set('onelinkEnabled', false);
                }
              }}
            />

            {!draft.kuickpayEnabled ? null : (
              <>
                <Field
                  label="Company prefix"
                  hint="The digits Kuickpay issued you. The child’s GR number is appended to it."
                  error={fieldErrors['kuickpayPrefix']}
                  required
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular-nums"
                    placeholder="1514"
                    maxLength={12}
                    value={draft.kuickpayPrefix ?? ''}
                    onChange={(event) => {
                      // Stripped as typed: a prefix with a space in it is a
                      // challan nobody can pay, found out at a bank counter.
                      set('kuickpayPrefix', event.target.value.replace(/\D/g, ''));
                    }}
                  />
                </Field>

                {sampleKuickpay === undefined ? null : (
                  <p className="text-xs text-muted-foreground">
                    A child with GR 810 would quote{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {sampleKuickpay}
                    </span>
                    .
                  </p>
                )}

                <Field
                  label="Where parents can pay"
                  hint="One per line. This is the list printed on the challan."
                  error={fieldErrors['kuickpayChannels']}
                >
                  <Textarea
                    rows={6}
                    className="text-xs"
                    value={channelText}
                    onChange={(event) => {
                      setChannelText(event.target.value);
                    }}
                  />
                </Field>

                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  onClick={() => {
                    setChannelText(DEFAULT_KUICKPAY_CHANNELS.join('\n'));
                  }}
                >
                  Use Kuickpay’s standard list
                </Button>
              </>
            )}
          </SettingsCard>

          <SettingsCard
            icon={<LinkIcon className={ICON_SIZE.nav} aria-hidden />}
            title="1LINK"
          >
            <CheckboxField
              label="Print a 1LINK ID"
              hint={
                draft.kuickpayEnabled
                  ? 'Printed under the Kuickpay strip.'
                  : 'Needs Kuickpay — the 1LINK number is built on top of it.'
              }
              checked={draft.onelinkEnabled}
              disabled={!draft.kuickpayEnabled}
              onCheckedChange={(next) => {
                set('onelinkEnabled', next === true);
              }}
            />

            {!draft.onelinkEnabled ? null : (
              <>
                <Field
                  label="Institution ID"
                  error={fieldErrors['onelinkInstitutionId']}
                  required
                >
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    className="tabular-nums"
                    placeholder="100047"
                    maxLength={12}
                    value={draft.onelinkInstitutionId ?? ''}
                    onChange={(event) => {
                      set('onelinkInstitutionId', event.target.value.replace(/\D/g, ''));
                    }}
                  />
                </Field>

                {sampleOnelink === undefined ? null : (
                  <p className="text-xs text-muted-foreground">
                    That child’s 1LINK number would be{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {sampleOnelink}
                    </span>
                    .
                  </p>
                )}
              </>
            )}
          </SettingsCard>
        </fieldset>

        {bankLogoSlot}

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

            <Button
              type="button"
              tone="outline"
              isPending={isDownloading}
              onClick={() => {
                void downloadChallan();
              }}
            >
              <ExportIcon className={ICON_SIZE.inline} aria-hidden />
              Download PDF ({String(preview.copyCount)} copies)
            </Button>
          </div>

          <div className="bg-muted/40 p-3 sm:p-4">
            <ChallanLivePreview copyCount={preview.copyCount}>
              <VoucherChallan voucher={SAMPLE} school={school} settings={preview} preview />
            </ChallanLivePreview>
          </div>
        </section>
      </div>

      {printRoot === null
        ? null
        : createPortal(
            <div className="challan-print-root print-stack">
              <VoucherChallan voucher={SAMPLE} school={school} settings={preview} />
            </div>,
            printRoot,
          )}
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
    const target = frame;

    function measure(): void {
      const width = target.getBoundingClientRect().width;
      if (width <= 0 || paperWidthPx <= 0) {
        return;
      }
      // Always fill the pane width — including upscaling a portrait (4-copy)
      // sheet so it does not sit as a narrow column in a wide card.
      setScale((width - 2) / paperWidthPx);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [sheet.width]);

  const scaledHeightPx = ((sheet.height / 25.4) * 96) * scale;

  return (
    <div
      ref={frameRef}
      className="w-full overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      <div className="relative w-full bg-white" style={{ height: scaledHeightPx }}>
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
        'relative flex cursor-pointer flex-col gap-3 rounded-xl border p-3 transition-colors',
        checked
          ? 'border-primary bg-primary/5 shadow-xs'
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

      {checked ? (
        <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ApproveIcon className="size-3" aria-hidden />
        </span>
      ) : null}

      {/* A4 proportions, and the sheet turns with the layout — three copies go
          across a landscape page, four down a portrait one. Which way up the
          paper goes is half of what is being chosen here. */}
      <span
        aria-hidden
        className={cn(
          'grid shrink-0 gap-[2px] self-start rounded-sm border border-border bg-card p-[3px]',
          count === 4 ? 'h-14 w-[2.5rem] grid-cols-2' : 'h-[2.5rem] w-14 grid-cols-3',
        )}
      >
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={cn(
              'rounded-[2px]',
              checked ? 'bg-primary/70' : 'bg-muted-foreground/25',
            )}
          />
        ))}
      </span>

      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{count} Copies</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {count === 3 ? 'Across a landscape sheet' : 'Two by two, portrait'}
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
      <div className="flex gap-3 border-b border-border px-4 py-3.5">
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
      <div className="space-y-4 px-4 py-4">{children}</div>
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
 * A textarea of outlet names into the list the challan prints.
 *
 * Blank lines dropped, because they are how a person separates what they are
 * typing from what is already there — not an outlet called "".
 */
function toChannels(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value.trim();
}
