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
import { Button, CheckboxField, Field, Input, Textarea, useToast } from '@ilm/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';

import { VoucherChallan } from './voucher-challan';

import { mutate } from '@/lib/mutate';

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
}

export function VoucherSettingsForm({
  settings,
  school,
  canConfigure,
  error,
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

  /** The draft exactly as the challan — and the server — will receive it. */
  const preview: VoucherSettings = {
    ...draft,
    kuickpayChannels: toChannels(channelText),
  };

  const sampleKuickpay = kuickpayConsumerNo(preview, SAMPLE.grNo);
  const sampleOnelink = onelinkConsumerNo(preview, SAMPLE.grNo);
  const hasLogo = school.logoVersion !== undefined;
  const copyLabelError =
    fieldErrors['copyLabels'] ??
    fieldErrors['copyLabels.0'] ??
    fieldErrors['copyLabels.1'] ??
    fieldErrors['copyLabels.2'];

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
      toast.error('Check the highlighted fields.');
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
    toast.success('Challan saved', 'Every challan printed from now on uses it.');
    router.refresh();
  }

  return (
    <form
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
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
          <Card title="The page">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Copies per sheet</p>
              <p className="text-xs text-muted-foreground">
                A4 either way. Three stack down the page; four sit in a square.
              </p>
              <div className="grid grid-cols-2 gap-2">
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
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Copy names</p>
              <p className="text-xs text-muted-foreground">
                One per copy, in order. Most schools keep School, Bank, Student.
              </p>
              {/* One input per copy, not a textarea of lines: the count is a
                  setting, and a box you can delete a line from produces a
                  payload the server has to refuse. */}
              <div className="grid gap-2 sm:grid-cols-2">
                {draft.copyLabels.map((label, index) => (
                  <Input
                    // The index is the identity: two copies may legitimately
                    // share a name, and it is the position being edited.
                    key={index}
                    value={label}
                    maxLength={40}
                    aria-label={`Copy ${String(index + 1)} name`}
                    aria-invalid={copyLabelError !== undefined}
                    onChange={(event) => {
                      setCopyLabel(index, event.target.value);
                    }}
                  />
                ))}
              </div>
              {copyLabelError === undefined ? null : (
                <p role="alert" className="text-xs text-danger">
                  {copyLabelError}
                </p>
              )}
            </div>
          </Card>

          <Card title="What it shows">
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
          </Card>

          <Card title="Kuickpay">
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
                    className="font-mono"
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
                    <span className="font-mono font-medium text-foreground">{sampleKuickpay}</span>.
                  </p>
                )}

                <Field
                  label="Where parents can pay"
                  hint="One per line. This is the list printed on the challan."
                  error={fieldErrors['kuickpayChannels']}
                >
                  <Textarea
                    rows={6}
                    className="font-mono text-xs"
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
          </Card>

          <Card title="1LINK">
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
                    className="font-mono"
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
                    <span className="font-mono font-medium text-foreground">{sampleOnelink}</span>.
                  </p>
                )}
              </>
            )}
          </Card>
        </fieldset>

        {canConfigure ? (
          <Button type="submit" isPending={isSaving}>
            Save challan
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
      <div className="no-print space-y-2 xl:sticky xl:top-4">
        <p className="text-sm text-muted-foreground">
          Live preview — the challan itself, with a made-up child on it.
        </p>
        {/* The sheet at its real size, zoomed down to fit — not reflowed. The
            width is the printable area of an A4 in the orientation this layout
            uses, so the preview has the paper's proportions and the copies fill
            it exactly as they will. Scaling rather than narrowing is what keeps
            it honest: a narrower preview makes a challan look cramped that is
            not, and a school would redesign around a problem it does not have. */}
        <div className="overflow-x-auto rounded-xl border border-border bg-white p-3">
          <div
            className={`[zoom:0.55] ${preview.copyCount === 4 ? 'w-[194mm]' : 'w-[281mm]'}`}
          >
            <VoucherChallan voucher={SAMPLE} school={school} settings={preview} />
          </div>
        </div>
      </div>
    </form>
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
      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
        checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
      }`}
    >
      <input
        type="radio"
        name="copyCount"
        className="sr-only"
        checked={checked}
        onChange={onSelect}
      />

      {/* A4 proportions, and the sheet turns with the layout — three copies go
          across a landscape page, four down a portrait one. Which way up the
          paper goes is half of what is being chosen here. */}
      <span
        aria-hidden
        className={`grid shrink-0 gap-[2px] rounded-xs border border-border bg-background p-[2px] ${
          count === 4 ? 'h-12 w-[2.12rem] grid-cols-2' : 'h-[2.12rem] w-12 grid-cols-3'
        }`}
      >
        {Array.from({ length: count }, (_, index) => (
          <span key={index} className="rounded-[1px] bg-muted-foreground/30" />
        ))}
      </span>

      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{count} copies</span>
        <span className="block text-xs text-muted-foreground">
          {count === 3 ? 'Across a landscape sheet' : 'Two by two, portrait'}
        </span>
      </span>
    </label>
  );
}

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      {children}
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
