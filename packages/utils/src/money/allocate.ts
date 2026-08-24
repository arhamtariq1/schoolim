import { invariant } from '../assert';

import { minorUnits, type MinorUnits } from './minor-units';

/**
 * Split an amount into weighted parts that sum **exactly** back to the whole.
 *
 * This is the function ADR-0007 refers to as "a documented remainder-allocation
 * rule". It uses the largest-remainder method:
 *
 *   1. Give each part the floor of its exact share.
 *   2. Distribute the leftover paisa, one each, to the parts with the largest
 *      fractional remainders.
 *   3. Break ties by index, so the result is deterministic and a re-run of the
 *      same allocation produces the same answer. That matters because voucher
 *      generation is idempotent (docs/12 R5) — a re-run must not shuffle paisa
 *      between students.
 *
 * Naively rounding each share independently would lose or invent paisa; over a
 * 500-student voucher run that difference is what stops a collection report
 * from reconciling.
 *
 * Negative totals are supported so that a reversing entry allocates as the
 * exact negation of the entry it reverses. The allocation is computed on the
 * magnitude and the sign is reapplied, which keeps that property exact.
 *
 * @param total   the amount to distribute; may be negative
 * @param weights non-negative integer weights, at least one of which is positive
 * @returns one amount per weight, in input order, summing exactly to `total`
 */
export function allocateMoney(total: MinorUnits, weights: readonly number[]): MinorUnits[] {
  invariant(weights.length > 0, 'cannot allocate across zero parts');

  for (const weight of weights) {
    invariant(
      Number.isInteger(weight),
      `allocation weights must be whole numbers, received ${weight}`,
    );
    invariant(weight >= 0, `allocation weights must not be negative, received ${weight}`);
  }

  const totalWeight = weights.reduce<number>((sum, weight) => sum + weight, 0);
  invariant(totalWeight > 0, 'allocation weights must not all be zero');

  // Widened out of the brand: unary minus is not defined on a branded number.
  const totalValue: number = total;
  const isNegative = totalValue < 0;
  const magnitude = BigInt(isNegative ? -totalValue : totalValue);
  const divisor = BigInt(totalWeight);

  // Step 1: floor share, and the remainder that decides who gets a spare paisa.
  const shares = weights.map((weight, index) => {
    const scaled = magnitude * BigInt(weight);
    return {
      index,
      base: scaled / divisor,
      remainder: scaled % divisor,
    };
  });

  const distributed = shares.reduce<bigint>((sum, share) => sum + share.base, 0n);
  let leftover = magnitude - distributed;

  // Step 2 and 3: largest remainder first, ties broken by original position.
  const byRemainder = [...shares].sort((a, b) => {
    if (a.remainder === b.remainder) {
      return a.index - b.index;
    }
    return a.remainder > b.remainder ? -1 : 1;
  });

  const allocated = new Array<bigint>(weights.length).fill(0n);
  for (const share of byRemainder) {
    const bonus = leftover > 0n ? 1n : 0n;
    leftover -= bonus;
    allocated[share.index] = share.base + bonus;
  }

  return allocated.map((amount) => minorUnits(Number(isNegative ? -amount : amount)));
}

/**
 * Split an amount into `parts` equal shares, remainder distributed to the
 * earliest parts. Sums exactly to the whole.
 */
export function splitMoney(total: MinorUnits, parts: number): MinorUnits[] {
  invariant(
    Number.isInteger(parts) && parts > 0,
    `parts must be a positive whole number, received ${parts}`,
  );
  return allocateMoney(total, new Array<number>(parts).fill(1));
}

/**
 * Allocate a payment across outstanding balances, oldest first, stopping when
 * the payment is exhausted.
 *
 * This is the allocation rule the fee module applies at the counter
 * (docs/modules/fees-and-finance.md): a part payment clears the oldest voucher
 * before touching a newer one. The caller supplies balances already sorted into
 * the intended order; this function does not reorder them, because "oldest" is
 * a domain decision and belongs in the service.
 *
 * @returns the amount applied to each balance, plus any unapplied surplus that
 *          the caller must record as a credit rather than silently drop
 */
export function allocateOldestFirst(
  payment: MinorUnits,
  balances: readonly MinorUnits[],
): { readonly applied: MinorUnits[]; readonly surplus: MinorUnits } {
  invariant(payment >= 0, 'a payment to allocate must not be negative');

  let remaining: number = payment;
  const applied = balances.map((balance) => {
    invariant(balance >= 0, 'an outstanding balance must not be negative');
    const amount = remaining < balance ? remaining : balance;
    remaining -= amount;
    return minorUnits(amount);
  });

  return { applied, surplus: minorUnits(remaining) };
}
