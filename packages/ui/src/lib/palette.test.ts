import { describe, expect, it } from 'vitest';

import { contrastRatio, oklchToRgb, toHex, type Oklch } from './palette';

/**
 * The palette, asserted.
 *
 * These values are copied from `@ilm/config/tailwind/theme.css` by hand, which
 * is the one thing worth knowing about this file: it is a second copy, and if
 * somebody edits the CSS without editing this, the test goes on passing while
 * the product changes. That is a real weakness and it is still worth having,
 * because the failure it prevents is the expensive one — a brand refresh that
 * drops every primary button's label under the legibility line, on the control
 * people press most, with nothing on screen to say so.
 *
 * A CSS parser reading the tokens directly would close the gap. Until the
 * palette moves often enough to justify one, the comment above the ramp in
 * `theme.css` points here.
 */

const BRAND: Record<number, Oklch> = {
  50: { l: 0.975, c: 0.011, h: 206 },
  100: { l: 0.946, c: 0.024, h: 206 },
  200: { l: 0.897, c: 0.042, h: 206 },
  300: { l: 0.827, c: 0.06, h: 206 },
  400: { l: 0.717, c: 0.078, h: 206 },
  500: { l: 0.636, c: 0.088, h: 206 },
  600: { l: 0.545, c: 0.089, h: 206 },
  700: { l: 0.47, c: 0.077, h: 201 },
  800: { l: 0.385, c: 0.064, h: 197 },
  900: { l: 0.323, c: 0.054, h: 195 },
  950: { l: 0.284, c: 0.048, h: 195 },
};

const STEEL_500: Oklch = { l: 0.531, c: 0.06, h: 222 };
const STEEL_600: Oklch = { l: 0.462, c: 0.055, h: 222 };

/** Light theme. */
const LIGHT_BG: Oklch = { l: 0.985, c: 0.002, h: 286 };
const LIGHT_CARD: Oklch = { l: 1, c: 0, h: 0 };
const LIGHT_FG: Oklch = { l: 0.21, c: 0.006, h: 285 };
const LIGHT_MUTED_FG: Oklch = { l: 0.552, c: 0.014, h: 285 };
const PRIMARY_FG: Oklch = { l: 0.985, c: 0, h: 0 };

/** Dark theme. */
const DARK_BG: Oklch = { l: 0.155, c: 0.005, h: 285 };
const DARK_CARD: Oklch = { l: 0.205, c: 0.006, h: 285 };
const DARK_FG: Oklch = { l: 0.96, c: 0.001, h: 286 };
const DARK_MUTED_FG: Oklch = { l: 0.712, c: 0.013, h: 286 };

/** docs/16 §6. Not a target. */
const AA = 4.5;
/** WCAG's allowance for text at 24px, or 19px bold. */
const AA_LARGE = 3;

describe('the brand colours are the ones that were asked for', () => {
  it('is the requested teal, two percent darker so white text clears 4.5:1', () => {
    // #1B838E measures 4.29:1 under white — below the line on every primary
    // button in the product. This is that colour at oklch L 0.545.
    expect(toHex(oklchToRgb(BRAND[600] as Oklch))).toBe('#147f8a');
  });

  it('reaches #013131 at the dark end, exactly', () => {
    expect(toHex(oklchToRgb(BRAND[950] as Oklch))).toBe('#013131');
  });

  it('has #427485 as the steel that sits in the middle of the gradient', () => {
    expect(toHex(oklchToRgb(STEEL_500))).toBe('#427485');
  });
});

describe('the ramp is a ramp', () => {
  it('gets darker at every step, with no plateau', () => {
    const steps = Object.keys(BRAND)
      .map(Number)
      .sort((a, b) => a - b);

    for (let index = 1; index < steps.length; index += 1) {
      const lighter = BRAND[steps[index - 1] as number] as Oklch;
      const darker = BRAND[steps[index] as number] as Oklch;
      expect(darker.l).toBeLessThan(lighter.l);
    }
  });

  it('drifts hue toward the dark anchor rather than holding one hue', () => {
    // 206 at the light end, 195 at the dark: a single-hue ramp would not arrive
    // at #013131.
    expect((BRAND[400] as Oklch).h).toBe(206);
    expect((BRAND[950] as Oklch).h).toBe(195);
  });
});

describe('text is legible on every surface it lands on', () => {
  const cases: [string, Oklch, Oklch, number][] = [
    // --- Light -------------------------------------------------------------
    ['body text on the page', LIGHT_FG, LIGHT_BG, AA],
    ['body text on a card', LIGHT_FG, LIGHT_CARD, AA],
    ['muted text on the page', LIGHT_MUTED_FG, LIGHT_BG, AA],
    ['a primary button’s label', PRIMARY_FG, BRAND[600] as Oklch, AA],
    ['a link, in brand, on the page', BRAND[600] as Oklch, LIGHT_BG, AA],
    ['a link, in brand, on a card', BRAND[600] as Oklch, LIGHT_CARD, AA],

    // --- Dark --------------------------------------------------------------
    ['body text on the dark page', DARK_FG, DARK_BG, AA],
    ['body text on a dark card', DARK_FG, DARK_CARD, AA],
    ['muted text on a dark card', DARK_MUTED_FG, DARK_CARD, AA],
    ['a primary button’s label, dark', LIGHT_FG, BRAND[400] as Oklch, AA],
    ['a link, in brand, on a dark card', BRAND[400] as Oklch, DARK_CARD, AA],

    // --- The gradient behind the sign-in art -------------------------------
    ['white on the gradient start', PRIMARY_FG, BRAND[950] as Oklch, AA],
    ['white on the gradient middle', PRIMARY_FG, STEEL_600, AA],
    ['white on the gradient end', PRIMARY_FG, BRAND[600] as Oklch, AA],
  ];

  for (const [label, foreground, background, minimum] of cases) {
    it(`${label} clears ${String(minimum)}:1`, () => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(minimum);
    });
  }
});

describe('text on a brand tint', () => {
  it('is brand-700, not the primary', () => {
    // The obvious pairing — a brand-50 pill with brand-600 text — measures
    // 4.45:1 and misses. It is close enough to look right on a designer's
    // monitor and wrong on a projector in a school hall, which is exactly the
    // kind of near-miss nobody catches by eye. So the rule is: a tinted surface
    // takes the next step down.
    expect(contrastRatio(BRAND[600] as Oklch, BRAND[50] as Oklch)).toBeLessThan(AA);
    expect(contrastRatio(BRAND[700] as Oklch, BRAND[50] as Oklch)).toBeGreaterThanOrEqual(AA);
  });

  it('leaves the tint itself too faint to be mistaken for a text colour', () => {
    expect(contrastRatio(BRAND[50] as Oklch, LIGHT_CARD)).toBeLessThan(AA_LARGE);
  });
});
