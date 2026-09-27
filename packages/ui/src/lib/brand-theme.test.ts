import { describe, expect, it } from 'vitest';

import { brandRamp, brandThemeCss, BRAND_STEPS, hexToOklch } from './brand-theme';
import { contrastRatio, inGamut, oklchToRgb, toHex } from './palette';

/**
 * A school's own colour, measured rather than admired.
 *
 * The point of this file is the fourth block. A tenant can type any hex into a
 * settings form, and docs/16 §6 makes 4.5:1 a rule — so "does a yellow brand
 * produce a legible button" has to be an assertion, not something somebody
 * looked at once on one monitor. Every hue on the wheel is checked, because the
 * one that fails will be the one nobody thought to try.
 */

/** Label colours from theme.css, repeated here so a drift in either is caught. */
const LIGHT_LABEL = { l: 0.985, c: 0, h: 0 };
const DARK_LABEL = { l: 0.21, c: 0.006, h: 285 };

describe('reading a colour in', () => {
  it('round-trips a hex through OKLCH and back', () => {
    for (const hex of ['#147f8a', '#7c3aed', '#b91c1c', '#0f172a', '#ffffff', '#000000']) {
      const oklch = hexToOklch(hex);
      expect(oklch).toBeDefined();
      expect(toHex(oklchToRgb(oklch!))).toBe(hex);
    }
  });

  it('accepts a hex with or without the hash, in either case', () => {
    expect(hexToOklch('147F8A')).toEqual(hexToOklch('#147f8a'));
  });

  it('refuses anything that is not a six-digit hex', () => {
    for (const bad of ['#fff', 'teal', '', '#1234567', 'rgb(1,2,3)', '#12345g']) {
      expect(hexToOklch(bad)).toBeUndefined();
    }
  });
});

describe('the ramp it builds', () => {
  it('gives every step a colour', () => {
    const ramp = brandRamp('#7c3aed');
    expect(ramp).toBeDefined();
    for (const step of BRAND_STEPS) {
      expect(ramp!.steps[step]).toBeDefined();
    }
  });

  it('runs light to dark, without a step going backwards', () => {
    const ramp = brandRamp('#7c3aed')!;
    const lightness = BRAND_STEPS.map((step) => ramp.steps[step].l);

    for (let index = 1; index < lightness.length; index += 1) {
      expect(lightness[index]!).toBeLessThan(lightness[index - 1]!);
    }
  });

  it('keeps the two ends where the product put them', () => {
    // The 50 is a background tint and the 950 is the ground the auth art sits
    // on. A school choosing a light brand must not end up with a 950 that
    // cannot hold white text.
    const ramp = brandRamp('#facc15')!;
    expect(ramp.steps[50].l).toBeCloseTo(0.975, 2);
    expect(ramp.steps[950].l).toBeCloseTo(0.284, 2);
  });

  it('carries the school’s hue all the way through', () => {
    const chosen = hexToOklch('#7c3aed')!;
    const ramp = brandRamp('#7c3aed')!;

    // The light half holds the hue exactly; the dark half drifts, by the same
    // amount the shipped ramp drifts, which is what stops a ramp held at one
    // hue arriving somewhere nobody asked for.
    expect(ramp.steps[600].h).toBeCloseTo(chosen.h, 1);
    expect(ramp.steps[950].h).toBeCloseTo(chosen.h - 11, 1);
  });

  it('returns nothing for a value it cannot read', () => {
    // The caller falls back to the shipped palette. A portal with no colours in
    // it is a worse answer than a portal in the default ones.
    expect(brandRamp('not a colour')).toBeUndefined();
  });
});

describe('what it does with an awkward choice', () => {
  it('pulls a near-white brand back into a range where a button is a button', () => {
    const ramp = brandRamp('#fef9c3')!;
    expect(ramp.steps[600].l).toBeLessThanOrEqual(0.68);
  });

  it('pulls a near-black brand up for the same reason', () => {
    const ramp = brandRamp('#0a0a0a')!;
    expect(ramp.steps[600].l).toBeGreaterThanOrEqual(0.42);
  });

  it('brings an unrepresentable colour into gamut rather than letting it clip', () => {
    // Pure red is at the edge of sRGB. Every step has to come back renderable,
    // or the clamp on the way out moves the hue step by step.
    const ramp = brandRamp('#ff0000')!;
    for (const step of BRAND_STEPS) {
      expect(inGamut(ramp.steps[step])).toBe(true);
    }
  });

  it('says so when it had to move the colour', () => {
    // Yellow is the case: nothing at a yellow's natural lightness carries white
    // text, so the primary is darkened and the form tells the school.
    expect(brandRamp('#facc15')!.adjusted).toBe(true);
  });

  it('leaves the product’s own colour alone', () => {
    // #147f8a was chosen because it measures 4.57:1. Nothing should move.
    const ramp = brandRamp('#147f8a')!;
    expect(ramp.adjusted).toBe(false);
    expect(ramp.primaryHex).toBe('#147f8a');
  });
});

describe('contrast, for every hue a school could pick', () => {
  // 5° apart, all the way round, at three saturations and three lightnesses.
  // A rule that holds for teal and fails for chartreuse is not a rule.
  const hexes: string[] = [];
  for (let hue = 0; hue < 360; hue += 5) {
    for (const [l, c] of [
      [0.55, 0.12],
      [0.72, 0.16],
      [0.4, 0.08],
    ] as const) {
      hexes.push(toHex(oklchToRgb({ l, c, h: hue })));
    }
  }

  it('never produces a primary button whose label is below 4.5:1', () => {
    const failures = hexes.filter((hex) => {
      const ramp = brandRamp(hex);
      return ramp === undefined || contrastRatio(ramp.steps[600], LIGHT_LABEL) < 4.5;
    });

    expect(failures).toEqual([]);
  });

  it('never produces a dark-mode primary whose label is below 4.5:1', () => {
    const failures = hexes.filter((hex) => {
      const ramp = brandRamp(hex);
      return ramp === undefined || contrastRatio(ramp.steps[400], DARK_LABEL) < 4.5;
    });

    expect(failures).toEqual([]);
  });

  it('reports the ratio it actually achieved', () => {
    for (const hex of hexes) {
      const ramp = brandRamp(hex)!;
      expect(ramp.lightContrast).toBeGreaterThanOrEqual(4.5);
      expect(ramp.darkContrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the 950 dark enough to hold white text in the auth art', () => {
    for (const hex of hexes) {
      const ramp = brandRamp(hex)!;
      expect(contrastRatio(ramp.steps[950], LIGHT_LABEL)).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('the CSS it emits', () => {
  it('declares every brand step and both steels', () => {
    const css = brandThemeCss(brandRamp('#7c3aed')!);

    for (const step of BRAND_STEPS) {
      expect(css).toContain(`--color-brand-${String(step)}:oklch(`);
    }
    expect(css).toContain('--color-steel-500:oklch(');
    expect(css).toContain('--color-steel-600:oklch(');
  });

  it('outranks the @theme block rather than relying on source order', () => {
    // `html:root` is one specificity point above the `:root` Tailwind emits, so
    // this wins wherever the browser puts the two stylesheets.
    expect(brandThemeCss(brandRamp('#7c3aed')!).startsWith('html:root{')).toBe(true);
  });

  it('contains nothing that could close the style element it goes in', () => {
    // It is interpolated into a `<style>` tag from a value a tenant typed. The
    // hex is validated long before here, but this is the assertion that says
    // the output is inert whatever arrives.
    const css = brandThemeCss(brandRamp('#7c3aed')!);
    expect(css).not.toMatch(/[<>]/);
  });
});

describe('staying inside sRGB', () => {
  it('renders every step of every ramp without a channel being clamped', () => {
    // An out-of-gamut step is clamped channel by channel on the way out, and
    // clamping one channel and not the others moves the hue — so a vivid
    // brand's 400 would come back a different colour from its 600, and a ramp
    // built from one choice would arrive looking like two.
    const offenders: string[] = [];

    for (let hue = 0; hue < 360; hue += 3) {
      for (const chroma of [0.1, 0.2, 0.3, 0.37]) {
        const hex = toHex(oklchToRgb({ l: 0.55, c: chroma, h: hue }));
        const ramp = brandRamp(hex)!;
        for (const step of BRAND_STEPS) {
          if (!inGamut(ramp.steps[step])) {
            offenders.push(`${hex} @ ${String(step)}`);
          }
        }
        if (!inGamut(ramp.steel500) || !inGamut(ramp.steel600)) {
          offenders.push(`${hex} @ steel`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps a saturated brand recognisably itself at its primary', () => {
    // The check that the gamut mapping did not quietly become a desaturator:
    // a vivid violet must still come back violet, within a couple of degrees.
    const chosen = hexToOklch('#7c3aed')!;
    const ramp = brandRamp('#7c3aed')!;

    expect(ramp.steps[600].h).toBeCloseTo(chosen.h, 0);
    expect(ramp.steps[600].c).toBeGreaterThan(0.15);
  });
});
