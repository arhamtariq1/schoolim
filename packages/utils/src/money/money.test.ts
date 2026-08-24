import { describe, expect, it } from 'vitest';

import { allocateMoney, allocateOldestFirst, splitMoney } from './allocate';
import { formatMoney, formatMoneyPlain } from './format';
import {
  addMoney,
  fromDecimalString,
  MAX_MINOR_UNITS,
  minorUnits,
  multiplyByRatio,
  negateMoney,
  percentageOfMoney,
  subtractMoney,
  sumMoney,
  toDecimalString,
  ZERO_MINOR,
} from './minor-units';
import { divideRoundHalfToEven } from './rounding';

/** Deterministic PRNG, so a failing property test reproduces exactly. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('divideRoundHalfToEven', () => {
  it('rounds a half to the even neighbour', () => {
    expect(divideRoundHalfToEven(5n, 2n)).toBe(2n); // 2.5 -> 2
    expect(divideRoundHalfToEven(7n, 2n)).toBe(4n); // 3.5 -> 4
    expect(divideRoundHalfToEven(9n, 2n)).toBe(4n); // 4.5 -> 4
    expect(divideRoundHalfToEven(11n, 2n)).toBe(6n); // 5.5 -> 6
  });

  it('rounds away from the half normally', () => {
    expect(divideRoundHalfToEven(6n, 4n)).toBe(2n); // 1.5 -> 2
    expect(divideRoundHalfToEven(7n, 4n)).toBe(2n); // 1.75 -> 2
    expect(divideRoundHalfToEven(5n, 4n)).toBe(1n); // 1.25 -> 1
  });

  it('is symmetric about zero, so a reversal is an exact negation', () => {
    for (const numerator of [5n, 7n, 9n, 11n, 13n, 1234567n]) {
      expect(divideRoundHalfToEven(-numerator, 2n)).toBe(-divideRoundHalfToEven(numerator, 2n));
    }
  });

  it('handles a negative denominator', () => {
    expect(divideRoundHalfToEven(5n, -2n)).toBe(-2n);
  });

  it('rejects division by zero', () => {
    expect(() => divideRoundHalfToEven(1n, 0n)).toThrow(/division by zero/);
  });
});

describe('minorUnits', () => {
  it('rejects a non-integer, which is how a float reaches a money field', () => {
    expect(() => minorUnits(10.5)).toThrow(/whole number of paisa/);
    expect(() => minorUnits(0.1 + 0.2)).toThrow(/whole number of paisa/);
  });

  it('rejects amounts numeric(14,2) could not store', () => {
    expect(() => minorUnits(MAX_MINOR_UNITS + 1)).toThrow(/out of range/);
    expect(() => minorUnits(-MAX_MINOR_UNITS - 1)).toThrow(/out of range/);
    expect(minorUnits(MAX_MINOR_UNITS)).toBe(MAX_MINOR_UNITS);
  });
});

describe('decimal string boundary', () => {
  it('round-trips exactly', () => {
    for (const value of [
      '0.00',
      '0.01',
      '0.10',
      '1.00',
      '1234.56',
      '-1234.56',
      '999999999999.99',
    ]) {
      expect(toDecimalString(fromDecimalString(value))).toBe(value);
    }
  });

  it('parses without float division, so 0.1 stays 0.1', () => {
    expect(fromDecimalString('0.10')).toBe(10);
    expect(fromDecimalString('0.1')).toBe(10);
    expect(fromDecimalString('0.3')).toBe(30);
    // The classic float failure: 0.1 + 0.2 !== 0.3 in IEEE-754.
    expect(addMoney(fromDecimalString('0.1'), fromDecimalString('0.2'))).toBe(
      fromDecimalString('0.3'),
    );
  });

  it('rejects anything that is not a numeric(14,2) value', () => {
    for (const value of ['1.234', 'abc', '', '1,234.00', '1e5', '9999999999999.99']) {
      expect(() => fromDecimalString(value)).toThrow();
    }
  });

  it('renders sub-rupee amounts with a leading zero', () => {
    expect(toDecimalString(minorUnits(5))).toBe('0.05');
    expect(toDecimalString(minorUnits(-5))).toBe('-0.05');
    expect(toDecimalString(ZERO_MINOR)).toBe('0.00');
  });
});

describe('arithmetic', () => {
  it('adds, subtracts, negates and sums', () => {
    const a = minorUnits(150_00);
    const b = minorUnits(49_50);
    expect(addMoney(a, b)).toBe(199_50);
    expect(subtractMoney(a, b)).toBe(100_50);
    expect(negateMoney(a)).toBe(-150_00);
    expect(sumMoney([a, b, negateMoney(b)])).toBe(150_00);
  });

  it('sums an empty list to zero', () => {
    expect(sumMoney([])).toBe(0);
  });

  it('surfaces an overflow at the operation, not at the database write', () => {
    const large = minorUnits(MAX_MINOR_UNITS);
    expect(() => addMoney(large, minorUnits(1))).toThrow(/out of range/);
  });
});

describe('percentageOfMoney', () => {
  it('takes a percentage in basis points, so no float is passed', () => {
    expect(percentageOfMoney(minorUnits(1000_00), 1000)).toBe(100_00); // 10%
    expect(percentageOfMoney(minorUnits(1000_00), 1250)).toBe(125_00); // 12.5%
    expect(percentageOfMoney(minorUnits(1000_00), 10_000)).toBe(1000_00); // 100%
    expect(percentageOfMoney(minorUnits(1000_00), 0)).toBe(0);
  });

  it('rounds exactly once, half-to-even', () => {
    // 1 paisa at 50% is exactly half a paisa -> the even neighbour, 0.
    expect(percentageOfMoney(minorUnits(1), 5000)).toBe(0);
    // 3 paisa at 50% is 1.5 -> the even neighbour, 2.
    expect(percentageOfMoney(minorUnits(3), 5000)).toBe(2);
  });

  it('rejects a negative percentage', () => {
    expect(() => percentageOfMoney(minorUnits(100), -1)).toThrow(/must not be negative/);
  });
});

describe('multiplyByRatio', () => {
  it('scales pro-rata without float drift', () => {
    // A monthly fee of 3,000 for 10 days of a 31-day month.
    expect(multiplyByRatio(minorUnits(3000_00), 10, 31)).toBe(967_74);
  });

  it('rejects a zero denominator', () => {
    expect(() => multiplyByRatio(minorUnits(100), 1, 0)).toThrow(/must not be zero/);
  });
});

describe('allocateMoney', () => {
  it('distributes the remainder by largest fraction, ties by index', () => {
    // 100.00 across three equal parts: 33.34 / 33.33 / 33.33.
    const parts = allocateMoney(minorUnits(100_00), [1, 1, 1]);
    expect(parts).toEqual([33_34, 33_33, 33_33]);
    expect(sumMoney(parts)).toBe(100_00);
  });

  it('respects weights', () => {
    const parts = allocateMoney(minorUnits(1000_00), [50, 30, 20]);
    expect(parts).toEqual([500_00, 300_00, 200_00]);
  });

  it('never loses or invents a paisa, across randomised inputs', () => {
    const random = createRandom(20260825);

    for (let iteration = 0; iteration < 2000; iteration += 1) {
      const total = minorUnits(Math.trunc(random() * 5_000_000) - 1_000_000);
      const partCount = 1 + Math.trunc(random() * 12);
      const weights = Array.from({ length: partCount }, () => Math.trunc(random() * 100));

      // `some` rather than `every`: an inferred type predicate on `every` would
      // narrow `weights` to `0[]` and make the assignment below a type error.
      if (!weights.some((weight) => weight > 0)) {
        weights[0] = 1;
      }

      const parts = allocateMoney(total, weights);

      expect(parts).toHaveLength(partCount);
      expect(sumMoney(parts)).toBe(total);
    }
  });

  it('is deterministic, so an idempotent re-run does not shuffle paisa', () => {
    const first = allocateMoney(minorUnits(100_01), [1, 1, 1, 1, 1, 1, 1]);
    const second = allocateMoney(minorUnits(100_01), [1, 1, 1, 1, 1, 1, 1]);
    expect(first).toEqual(second);
  });

  it('allocates a negative total as the exact negation of the positive', () => {
    const positive = allocateMoney(minorUnits(100_00), [1, 1, 1]);
    const negative = allocateMoney(minorUnits(-100_00), [1, 1, 1]);
    const negatedPositive = positive.map((amount) => {
      const value: number = amount;
      return -value;
    });
    expect(negative).toEqual(negatedPositive);
    expect(sumMoney(negative)).toBe(-100_00);
  });

  it('handles a zero total', () => {
    expect(allocateMoney(ZERO_MINOR, [3, 1])).toEqual([0, 0]);
  });

  it('gives zero-weight parts nothing', () => {
    expect(allocateMoney(minorUnits(100_00), [1, 0, 1])).toEqual([50_00, 0, 50_00]);
  });

  it('rejects degenerate weightings rather than guessing', () => {
    expect(() => allocateMoney(minorUnits(100), [])).toThrow(/zero parts/);
    expect(() => allocateMoney(minorUnits(100), [0, 0])).toThrow(/must not all be zero/);
    expect(() => allocateMoney(minorUnits(100), [-1, 2])).toThrow(/must not be negative/);
    expect(() => allocateMoney(minorUnits(100), [1.5, 2])).toThrow(/whole numbers/);
  });
});

describe('splitMoney', () => {
  it('splits evenly with the remainder to the earliest parts', () => {
    expect(splitMoney(minorUnits(10_00), 3)).toEqual([334, 333, 333]);
    expect(sumMoney(splitMoney(minorUnits(10_00), 3))).toBe(10_00);
  });

  it('rejects a non-positive part count', () => {
    expect(() => splitMoney(minorUnits(100), 0)).toThrow(/positive whole number/);
  });
});

describe('allocateOldestFirst', () => {
  const balances = [minorUnits(500_00), minorUnits(300_00), minorUnits(200_00)];

  it('clears the oldest balance before touching a newer one', () => {
    const { applied, surplus } = allocateOldestFirst(minorUnits(600_00), balances);
    expect(applied).toEqual([500_00, 100_00, 0]);
    expect(surplus).toBe(0);
  });

  it('returns an overpayment as surplus rather than dropping it', () => {
    const { applied, surplus } = allocateOldestFirst(minorUnits(1200_00), balances);
    expect(applied).toEqual([500_00, 300_00, 200_00]);
    expect(surplus).toBe(200_00);
  });

  it('applies nothing when the payment is zero', () => {
    const { applied, surplus } = allocateOldestFirst(ZERO_MINOR, balances);
    expect(applied).toEqual([0, 0, 0]);
    expect(surplus).toBe(0);
  });

  it('conserves the payment exactly', () => {
    const payment = minorUnits(742_37);
    const { applied, surplus } = allocateOldestFirst(payment, balances);
    expect(sumMoney([...applied, surplus])).toBe(payment);
  });

  it('rejects a negative payment', () => {
    expect(() => allocateOldestFirst(minorUnits(-1), balances)).toThrow(/must not be negative/);
  });
});

describe('formatting', () => {
  it('renders two decimal places', () => {
    expect(formatMoneyPlain(minorUnits(1234_50))).toMatch(/1,234\.50/);
    expect(formatMoneyPlain(ZERO_MINOR)).toMatch(/0\.00/);
  });

  it('includes a currency indication when asked', () => {
    expect(formatMoney(minorUnits(1234_50))).toMatch(/1,234\.50/);
    expect(formatMoney(minorUnits(1234_50))).not.toBe(formatMoneyPlain(minorUnits(1234_50)));
  });

  it('renders a negative amount, for a reversing entry', () => {
    expect(formatMoneyPlain(minorUnits(-1234_50))).toMatch(/1,234\.50/);
  });
});
