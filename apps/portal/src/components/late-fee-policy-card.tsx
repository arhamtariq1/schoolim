'use client';

import { ROUTES, type LateFeePolicy } from '@ilm/contracts';
import { Button, Field, Input, Money, useToast } from '@ilm/ui';
import { ICON_SIZE, SpinnerIcon } from '@ilm/ui/icons';
import { minorUnits, percentageOfMoney } from '@ilm/utils';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { rupeesToMinor } from '@/lib/money';
import { mutate } from '@/lib/mutate';

/**
 * Settings › Fees › the late fee.
 *
 * ## Why this is not in the fee-type list above it
 *
 * Everything in the catalogue is a charge a student is *assigned* and then
 * billed for. A late fee is assigned to nobody: it is a consequence of a due
 * date passing, worked out per voucher, and it is owed only by whoever actually
 * pays late. As a fee type it could be added to a child's permanent structure
 * and billed every month whether or not that family was ever late — which is
 * the opposite of a late fee, so it is one setting per school instead.
 *
 * ## Why the example is on screen
 *
 * "2% plus 200" is not a number anybody can picture. The worked example turns
 * the policy into the figure that will be printed on a challan, which is the
 * only form in which a school can tell whether it is the policy they meant.
 */

/** The amount the worked example is based on. A typical monthly tuition. */
const EXAMPLE_MINOR = 600_000;

export interface LateFeePolicyCardProps {
  readonly policy: LateFeePolicy;
  readonly canConfigure: boolean;
  readonly error?: string | undefined;
}

export function LateFeePolicyCard({ policy, canConfigure, error }: LateFeePolicyCardProps) {
  const router = useRouter();
  const toast = useToast();

  // Basis points on the wire, percent in the box: 250 is what the API wants and
  // "2.5" is what a person types.
  const [percent, setPercent] = useState(() => basisPointsToPercent(policy.percentBasisPoints));
  const [flat, setFlat] = useState(() => minorToPlain(policy.flatMinor));
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const percentBasisPoints = percentToBasisPoints(percent);
  const flatMinor = flat.trim() === '' ? 0 : rupeesToMinor(flat);

  const percentInvalid = percentBasisPoints === undefined;
  const flatInvalid = flatMinor === undefined;

  const isDirty =
    percentBasisPoints !== policy.percentBasisPoints || (flatMinor ?? -1) !== policy.flatMinor;

  const exampleMinor =
    percentInvalid || flatInvalid
      ? undefined
      : percentageOfMoney(minorUnits(EXAMPLE_MINOR), percentBasisPoints) + flatMinor;

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (percentBasisPoints === undefined || flatMinor === undefined) {
      return;
    }

    setIsSaving(true);
    setFormError(undefined);

    const result = await mutate<LateFeePolicy>(ROUTES.fees.lateFeePolicy, 'PUT', {
      percentBasisPoints,
      flatMinor,
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
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="late-fee">
      <h2 id="late-fee" className="text-base font-medium text-foreground">
        Late fee
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Added to a challan when it is paid after the due date. It is not a fee type, because it is
        owed only by a family who actually pays late — so it is set once here rather than assigned
        to anybody.{' '}
        <strong className="font-medium text-foreground">
          Changing it never re-rates a voucher that has already been issued.
        </strong>
      </p>

      {error === undefined ? null : (
        <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {formError === undefined ? null : (
        <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {formError}
        </p>
      )}

      <form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={(event) => void save(event)}>
        <Field
          label="Percentage"
          hint="Of the amount payable within the due date"
          error={percentInvalid ? 'Enter a percentage between 0 and 100.' : undefined}
        >
          <Input
            inputMode="decimal"
            value={percent}
            placeholder="0"
            disabled={!canConfigure}
            onChange={(event) => {
              setPercent(event.target.value);
            }}
          />
        </Field>

        <Field
          label="Fixed amount (PKR)"
          hint="Added on top of the percentage"
          error={flatInvalid ? 'Enter an amount, or leave it blank.' : undefined}
        >
          <Input
            inputMode="decimal"
            value={flat}
            placeholder="0"
            disabled={!canConfigure}
            onChange={(event) => {
              setFlat(event.target.value);
            }}
          />
        </Field>

        <div className="flex items-end">
          {canConfigure ? (
            <Button type="submit" disabled={isSaving || !isDirty || percentInvalid || flatInvalid}>
              {isSaving ? (
                <SpinnerIcon className={`${ICON_SIZE.inline} animate-spin`} aria-hidden />
              ) : null}
              Save late fee
            </Button>
          ) : null}
        </div>
      </form>

      <p className="mt-3 text-sm text-muted-foreground">
        {exampleMinor === undefined ? null : exampleMinor === 0 ? (
          <>
            No late fee is charged. A challan’s “payable after due date” is the same as its amount,
            which is what the printed challan will say.
          </>
        ) : (
          <>
            On a <Money valueMinor={minorUnits(EXAMPLE_MINOR)} /> challan, a parent paying after the
            due date would owe{' '}
            <strong className="font-medium text-foreground">
              <Money valueMinor={minorUnits(EXAMPLE_MINOR + exampleMinor)} />
            </strong>{' '}
            — <Money valueMinor={minorUnits(exampleMinor)} /> more.
          </>
        )}
      </p>
    </section>
  );
}

/** `250` → `"2.5"`. Integer arithmetic; basis points never meet a float. */
function basisPointsToPercent(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = basisPoints % 100;
  if (fraction === 0) {
    return String(whole);
  }
  return `${String(whole)}.${String(fraction).padStart(2, '0')}`.replace(/0$/, '');
}

/**
 * `"2.5"` → `250`, and anything that is not a percentage → `undefined`.
 *
 * Parsed from the digits rather than through `Number(value) * 100`, which would
 * route a rate through a float and turn 2.3% into 229.99999999999997.
 */
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

/** Paisa back to the plain digits an input wants. */
function minorToPlain(minor: number): string {
  if (minor === 0) {
    return '';
  }
  const paisa = minor % 100;
  return paisa === 0
    ? String(Math.trunc(minor / 100))
    : `${String(Math.trunc(minor / 100))}.${String(paisa).padStart(2, '0')}`;
}
