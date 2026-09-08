import { describe, expect, it } from 'vitest';

import { pagesToRender } from './pagination';

/**
 * The windowing maths, on its own.
 *
 * Off-by-one errors here are invisible until a school has enough data to
 * produce them — which is the worst possible moment to find out.
 */
describe('pagesToRender', () => {
  it('lists every page when there are few enough to fit', () => {
    expect(pagesToRender(1, 1)).toEqual([1]);
    expect(pagesToRender(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the first and last page reachable from anywhere', () => {
    const middle = pagesToRender(40, 80);
    expect(middle[0]).toBe(1);
    expect(middle[middle.length - 1]).toBe(80);
  });

  it('shows a window around the current page', () => {
    expect(pagesToRender(40, 80)).toEqual([1, '…', 38, 39, 40, 41, 42, '…', 80]);
  });

  it('never hides a single page behind an ellipsis', () => {
    // "1 … 3" is silly where "1 2 3" fits, so a gap of exactly one renders as
    // the number it was hiding.
    expect(pagesToRender(4, 80)).toEqual([1, 2, 3, 4, 5, 6, '…', 80]);
  });

  it('does not run off either end', () => {
    expect(pagesToRender(1, 80)).toEqual([1, 2, 3, '…', 80]);
    expect(pagesToRender(80, 80)).toEqual([1, '…', 78, 79, 80]);
  });
});
