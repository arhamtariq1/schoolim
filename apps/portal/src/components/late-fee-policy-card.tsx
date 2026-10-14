'use client';

import { ROUTES, type LateFeePolicy } from '@ilm/contracts';
import { Button, Field, Input, Money, SimpleSelect, useToast } from '@ilm/ui';
import { ICON_SIZE, OverdueIcon } from '@ilm/ui/icons';
import { minorUnits, percentageOfMoney } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';

/**
 * Settings › Fees › the late fee.
 *
 * Everything in the catalogue is a charge a student is *assigned* and then
 * billed for. A late fee is assigned to nobody: it is a consequence of a due
 * date passing, worked out per voucher, and it is owed only by whoever actually
 * pays late.
 *
 * A school picks **one** shape — percentage or fixed — not both. The API still
 * stores both columns (the other is zero) so older challans and generation keep
 * a single compute path.
 */

const EXAMPLE_MINOR = 600_000;

const MODE_OPTIONS = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed', label: 'Fixed amount' },
] as const;

type LateFeeMode = (typeof MODE_OPTIONS)[number]['value'];

export interface LateFeePolicyCardProps {
  readonly policy: LateFeePolicy;
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
}

export function LateFeePolicyCard({ policy, canConfigure, error }: LateFeePolicyCardProps) {
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<LateFeeMode>(() => modeFromPolicy(policy));
  const [percent, setPercent] = useState(() => displayPercent(policy.percentBasisPoints));
  const [flat, setFlat] = useState(() => displayFlat(policy.flatMinor));
  const [graceDays, setGraceDays] = useState(() => String(policy.graceDays));
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const percentBasisPoints =
    mode === 'percentage' ? percentToBasisPoints(percent) : 0;
  const flatMinor =
    mode === 'fixed' ? (flat.trim() === '' ? 0 : rupeesToMinor(flat)) : 0;
  const graceDaysValue = parseGraceDays(graceDays);

  const percentInvalid = mode === 'percentage' && percentBasisPoints === undefined;
  const flatInvalid = mode === 'fixed' && flatMinor === undefined;
  const graceInvalid = graceDaysValue === undefined;

  const savedMode = modeFromPolicy(policy);
  const isDirty =
    mode !== savedMode ||
    (mode === 'percentage'
      ? percentBasisPoints !== policy.percentBasisPoints
      : (flatMinor ?? -1) !== policy.flatMinor) ||
    (graceDaysValue ?? -1) !== policy.graceDays;

  const exampleMinor =
    percentInvalid || flatInvalid || percentBasisPoints === undefined || flatMinor === undefined
      ? undefined
      : percentageOfMoney(minorUnits(EXAMPLE_MINOR), percentBasisPoints) + flatMinor;

  const policyIsZero = policy.percentBasisPoints === 0 && policy.flatMinor === 0;
  const draftIsZero =
    !percentInvalid &&
    !flatInvalid &&
    percentBasisPoints !== undefined &&
    flatMinor !== undefined &&
    percentBasisPoints === 0 &&
    flatMinor === 0;

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (
      percentBasisPoints === undefined ||
      flatMinor === undefined ||
      graceDaysValue === undefined
    ) {
      return;
    }

    setIsSaving(true);
    setFormError(undefined);

    const result = await mutate<LateFeePolicy>(ROUTES.fees.lateFeePolicy, 'PUT', {
      percentBasisPoints,
      flatMinor,
      graceDays: graceDaysValue,
    });

    setIsSaving(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    toast.success(
      percentBasisPoints === 0 && flatMinor === 0
        ? 'Late fees are off. Nothing extra is charged after the due date.'
        : 'Late fee saved. It applies to vouchers generated from now on.',
    );
    router.refresh();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-raised">
      <div className="flex gap-4 border-b border-border px-6 py-5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <OverdueIcon className={ICON_SIZE.nav} aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-1">
          <h2 id="late-fee" className="text-lg font-semibold text-foreground">
            Late fee
          </h2>
          <p className="text-sm text-muted-foreground">
            Added to a challan when it is paid after the due date. Choose percentage or a fixed
            amount — only one applies.{' '}
            <strong className="font-medium text-foreground">
              Changing it never re-rates a voucher that has already been issued.
            </strong>
          </p>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        {error === undefined ? null : (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}
        {formError === undefined ? null : (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        )}

        <form
          className="space-y-5"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Late fee type" required>
              <SimpleSelect
                value={mode}
                onValueChange={(next) => {
                  setMode(next as LateFeeMode);
                }}
                options={[...MODE_OPTIONS]}
                ariaLabel="Late fee type"
                disabled={!canConfigure}
              />
            </Field>

            {mode === 'percentage' ? (
              <Field
                label="Percentage"
                hint="Of the amount payable within the due date"
                error={percentInvalid ? 'Enter a percentage between 0 and 100.' : undefined}
                required
              >
                <Input
                  inputMode="decimal"
                  value={percent}
                  placeholder="0"
                  className="tabular-nums"
                  disabled={!canConfigure}
                  onChange={(event) => {
                    setPercent(event.target.value);
                  }}
                />
              </Field>
            ) : (
              <Field
                label="Fixed amount (PKR)"
                hint="Charged in full after the grace period"
                error={flatInvalid ? 'Enter an amount, or leave it blank.' : undefined}
                required
              >
                <Input
                  inputMode="decimal"
                  value={flat}
                  placeholder="0"
                  className="tabular-nums"
                  disabled={!canConfigure}
                  onChange={(event) => {
                    setFlat(event.target.value);
                  }}
                />
              </Field>
            )}

            <Field
              label="Apply after (days)"
              hint="Days after the due date before the surcharge applies. 0 = next day."
              error={graceInvalid ? 'Enter a whole number from 0 to 90.' : undefined}
            >
              <Input
                inputMode="numeric"
                value={graceDays}
                placeholder="0"
                className="tabular-nums"
                disabled={!canConfigure}
                onChange={(event) => {
                  setGraceDays(event.target.value);
                }}
              />
            </Field>
          </div>

          {canConfigure ? (
            <div className="flex justify-end">
              <Button
                type="submit"
                className="h-10 w-full sm:w-auto"
                disabled={isSaving || !isDirty || percentInvalid || flatInvalid || graceInvalid}
                isPending={isSaving}
              >
                Save late fee
              </Button>
            </div>
          ) : null}
        </form>

        <p className="text-sm text-muted-foreground">
          {draftIsZero || (policyIsZero && exampleMinor === 0) ? (
            <>
              No late fee is charged. A challan’s “payable after due date” is the same as its amount,
              which is what the printed challan will say.
            </>
          ) : exampleMinor === undefined ? null : (
            <>
              On a <Money valueMinor={minorUnits(EXAMPLE_MINOR)} /> challan, a parent paying after
              the due date
              {graceDaysValue !== undefined && graceDaysValue > 0
                ? ` (plus ${String(graceDaysValue)} grace ${graceDaysValue === 1 ? 'day' : 'days'})`
                : ''}{' '}
              would owe{' '}
              <strong className="font-medium text-foreground">
                <Money valueMinor={minorUnits(EXAMPLE_MINOR + exampleMinor)} />
              </strong>{' '}
              — <Money valueMinor={minorUnits(exampleMinor)} /> more.
            </>
          )}
        </p>
      </div>
    </section>
  );
}

function modeFromPolicy(policy: LateFeePolicy): LateFeeMode {
  if (policy.flatMinor > 0 && policy.percentBasisPoints === 0) {
    return 'fixed';
  }
  return 'percentage';
}

function displayPercent(basisPoints: number): string {
  const text = basisPointsToPercent(basisPoints);
  return text === '' ? '0' : text;
}

function displayFlat(minor: number): string {
  const text = minorToPlain(minor);
  return text === '' ? '0' : text;
}

function parseGraceDays(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  if (!/^\d{1,2}$/.test(trimmed)) {
    return undefined;
  }
  const days = Number(trimmed);
  return days > 90 ? undefined : days;
}

function basisPointsToPercent(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = basisPoints % 100;
  if (fraction === 0) {
    return String(whole);
  }
  return `${String(whole)}.${String(fraction).padStart(2, '0')}`.replace(/0$/, '');
}

function percentToBasisPoints(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) {
    return undefined;
  }
  const [whole, fraction = ''] = trimmed.split('.');
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return basisPoints > 10_000 ? undefined : basisPoints;
}

function minorToPlain(minor: number): string {
  if (minor === 0) {
    return '';
  }
  const paisa = minor % 100;
  return paisa === 0
    ? String(Math.trunc(minor / 100))
    : `${String(Math.trunc(minor / 100))}.${String(paisa).padStart(2, '0')}`;
}
