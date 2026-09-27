import { contrastRatio, inGamut, oklchToRgb, toHex, type Oklch } from './palette';

/**
 * One school's colour, turned into the whole brand ramp.
 *
 * `theme.css` says it in its header: per-school branding is a **runtime swap of
 * `--brand-*`**, which is why every brand colour in there is a variable rather
 * than a literal. This is the other half of that sentence — the part that
 * decides what to swap them to.
 *
 * ## Why a school picks one colour and not eleven
 *
 * Nobody running a school wants to choose a 50 and a 950. They want their
 * colour on the buttons. So the input is a single hex, and everything else is
 * derived from the ramp the product already ships — which was drawn by hand,
 * measured, and has a test asserting its contrast.
 *
 * What is taken from the school: the **hue**, the **chroma**, and the
 * **lightness of the primary step**. What is kept from the product: the shape
 * of the curve — how lightness and chroma fall away towards each end, and the
 * slight hue drift towards the dark end that stops a ramp held at one hue
 * arriving somewhere nobody asked for.
 *
 * That split is what keeps a tenant's portal looking like this product rather
 * than like eleven random swatches, while still being unmistakably theirs.
 *
 * ## Contrast is enforced, not hoped for
 *
 * docs/16 §6 makes 4.5:1 a rule. A school can pick `#ffe400`, and a yellow
 * button with white text on it is illegible — so the steps that actually carry
 * text are measured and darkened (or lightened) until they pass, and the caller
 * is told it happened. Refusing the colour outright would be the easy answer
 * and the wrong one: the school wants yellow, and yellow with legible text is
 * something we can give them.
 *
 * Two steps carry text and are therefore checked:
 *
 *   * **600** — the light-mode primary, under near-white label text.
 *   * **400** — the dark-mode primary, under near-black label text.
 */

/** Steps in the ramp, light to dark. Matches `--color-brand-*` in theme.css. */
export const BRAND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export type BrandStep = (typeof BRAND_STEPS)[number];

/**
 * The shipped ramp, as the curve every derived ramp is shaped by.
 *
 * `dh` is the hue offset from the 600, not an absolute hue: the shipped ramp
 * drifts from 206 at the light end to 195 at the dark, and a school's ramp
 * should drift by the same amount from wherever *their* hue is.
 *
 * `rc` is chroma relative to the 600's, so the curve scales with whatever
 * saturation the school picked rather than being pinned to this one's.
 */
const CURVE: Record<BrandStep, { l: number; rc: number; dh: number }> = {
  50: { l: 0.975, rc: 0.124, dh: 0 },
  100: { l: 0.946, rc: 0.27, dh: 0 },
  200: { l: 0.897, rc: 0.472, dh: 0 },
  300: { l: 0.827, rc: 0.674, dh: 0 },
  400: { l: 0.717, rc: 0.876, dh: 0 },
  500: { l: 0.636, rc: 0.989, dh: 0 },
  600: { l: 0.545, rc: 1, dh: 0 },
  700: { l: 0.47, rc: 0.865, dh: -5 },
  800: { l: 0.385, rc: 0.719, dh: -9 },
  900: { l: 0.323, rc: 0.607, dh: -11 },
  950: { l: 0.284, rc: 0.539, dh: -11 },
};

/** The shipped primary's lightness — the anchor the rescale pivots around. */
const ANCHOR_L = CURVE[600].l;

/** The steel that sits in the middle of the brand gradient, +16° off the brand. */
const STEEL_HUE_OFFSET = 222 - 206;

/** Label text on a primary surface, light and dark mode. From theme.css. */
const LIGHT_LABEL: Oklch = { l: 0.985, c: 0, h: 0 };
const DARK_LABEL: Oklch = { l: 0.21, c: 0.006, h: 285 };

/** docs/16 §6, and not negotiable. */
const MIN_CONTRAST = 4.5;

/**
 * A ceiling on saturation, well above any real brand colour.
 *
 * Not the gamut check — that is `toGamut` below, applied per step, because
 * whether a colour is representable depends on its lightness and hue as much as
 * on its chroma. This is only a guard against a value so extreme that every
 * step would be mapped down to roughly the same place.
 */
const MAX_CHROMA = 0.37;

/**
 * How far the primary's lightness may sit from the shipped one.
 *
 * Somebody who picks near-black or near-white for their brand has picked a
 * colour that cannot be a button: at L 0.1 there is no label colour that works
 * at all, and at L 0.95 the button disappears into the page. Clamping into a
 * usable band gives them their hue on a control that still reads as a control.
 */
const MIN_PRIMARY_L = 0.42;
const MAX_PRIMARY_L = 0.68;

export interface BrandRamp {
  /** `50` → an OKLCH triple, for every step. */
  readonly steps: Record<BrandStep, Oklch>;
  /** The gradient's middle, rotated with the brand so the three still agree. */
  readonly steel500: Oklch;
  readonly steel600: Oklch;
  /** What the primary button's label measures against its background. */
  readonly lightContrast: number;
  readonly darkContrast: number;
  /**
   * True when the colour asked for could not be used as-is and was moved to
   * clear 4.5:1. The UI says so rather than quietly changing it.
   */
  readonly adjusted: boolean;
  /** The primary as the school will actually see it, for the swatch. */
  readonly primaryHex: string;
}

/** sRGB → OKLCH. The inverse of `oklchToRgb`, for reading a school's hex in. */
export function hexToOklch(hex: string): Oklch | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match?.[1] === undefined) {
    return undefined;
  }

  const int = Number.parseInt(match[1], 16);
  const decode = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

  const r = decode(((int >> 16) & 0xff) / 255);
  const g = decode(((int >> 8) & 0xff) / 255);
  const b = decode((int & 0xff) / 255);

  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const bb = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;

  const hue = (Math.atan2(bb, a) * 180) / Math.PI;

  return { l, c: Math.hypot(a, bb), h: hue < 0 ? hue + 360 : hue };
}

/**
 * Darken (or lighten) one step until its label text is legible on it.
 *
 * A search in hundredths of a lightness unit rather than anything cleverer:
 * the space is one-dimensional and tiny, contrast moves monotonically with
 * lightness once the label is fixed, and forty iterations of arithmetic is not
 * a cost worth being clever about. Returns the original if nothing in range
 * works, which cannot happen for a label at either end of the scale but is not
 * worth assuming.
 */
function fixContrast(colour: Oklch, label: Oklch, direction: 1 | -1): Oklch {
  let candidate = toGamut(colour);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (contrastRatio(candidate, label) >= MIN_CONTRAST) {
      return candidate;
    }
    const next = candidate.l + direction * 0.005;
    if (next <= 0.02 || next >= 0.99) {
      return candidate;
    }
    // Mapped *before* it is measured, every time. Gamut mapping changes chroma,
    // chroma changes luminance, and luminance is the whole of contrast — so a
    // candidate measured before mapping is not the colour that ships. Doing
    // this afterwards instead left an orange that measured 4.49:1 on screen
    // while the search believed it had cleared the line.
    candidate = toGamut({ ...candidate, l: next });
  }

  return candidate;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Pull a step's chroma down until sRGB can actually render it.
 *
 * Without this, an out-of-gamut step is silently clamped channel by channel on
 * the way out — and clamping one channel and not the others moves the hue. A
 * vivid violet's 400 would come back visibly pinker than its 600, so a ramp
 * built from one colour would arrive looking like two.
 *
 * Reducing chroma and holding lightness and hue is the standard mapping, and it
 * is the right one here: the school chose a hue, and losing a little saturation
 * at the light end is invisible beside a step that has drifted to a different
 * colour.
 */
function toGamut(colour: Oklch): Oklch {
  if (inGamut(colour)) {
    return colour;
  }

  // Binary search rather than stepping down: 20 iterations puts it within a
  // millionth of the boundary, against 100+ for a step small enough to matter.
  let low = 0;
  let high = colour.c;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const mid = (low + high) / 2;
    if (inGamut({ ...colour, c: mid })) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return { ...colour, c: low };
}

/**
 * Build a school's ramp from one colour.
 *
 * Returns `undefined` for anything that is not a six-digit hex, so a caller
 * with a bad value in the database falls back to the shipped palette rather
 * than rendering a portal with no colours in it.
 */
export function brandRamp(hex: string): BrandRamp | undefined {
  const chosen = hexToOklch(hex);
  if (chosen === undefined) {
    return undefined;
  }

  const hue = chosen.h;
  const peakChroma = clamp(chosen.c, 0, MAX_CHROMA);

  // The primary carries the school's own lightness, clamped into a band where a
  // button is still a button. Everything else is the shipped curve rescaled to
  // meet it, so the two ends stay where they are: the 50 remains a background
  // tint and the 950 remains the deep ground the auth art sits on.
  const primaryL = clamp(chosen.l, MIN_PRIMARY_L, MAX_PRIMARY_L);

  const rescale = (l: number): number => {
    if (l >= ANCHOR_L) {
      // Lighter half: [anchor, 0.975] → [primary, 0.975].
      const t = (l - ANCHOR_L) / (CURVE[50].l - ANCHOR_L);
      return primaryL + t * (CURVE[50].l - primaryL);
    }
    // Darker half: [0.284, anchor] → [0.284, primary].
    const t = (l - CURVE[950].l) / (ANCHOR_L - CURVE[950].l);
    return CURVE[950].l + t * (primaryL - CURVE[950].l);
  };

  const steps = {} as Record<BrandStep, Oklch>;
  for (const step of BRAND_STEPS) {
    const spec = CURVE[step];
    steps[step] = toGamut({
      l: rescale(spec.l),
      c: peakChroma * spec.rc,
      h: (hue + spec.dh + 360) % 360,
    });
  }

  // Only now, once the ramp exists, are the two steps that carry text measured.
  // 600 darkens towards its white label; 400 lightens towards its dark one.
  const before = { light: steps[600], dark: steps[400] };
  steps[600] = fixContrast(steps[600], LIGHT_LABEL, -1);
  steps[400] = fixContrast(steps[400], DARK_LABEL, 1);

  return {
    steps,
    steel500: toGamut({
      l: steps[500].l,
      c: steps[500].c * 0.68,
      h: (hue + STEEL_HUE_OFFSET) % 360,
    }),
    steel600: toGamut({
      l: steps[600].l * 0.85,
      c: steps[600].c * 0.62,
      h: (hue + STEEL_HUE_OFFSET) % 360,
    }),
    lightContrast: contrastRatio(steps[600], LIGHT_LABEL),
    darkContrast: contrastRatio(steps[400], DARK_LABEL),
    adjusted: steps[600].l !== before.light.l || steps[400].l !== before.dark.l,
    primaryHex: toHex(oklchToRgb(steps[600])),
  };
}

/** `oklch(0.545 0.089 206)`, rounded to what CSS needs and no further. */
function css(colour: Oklch): string {
  const round = (value: number, places: number): string => {
    const factor = 10 ** places;
    // `Math.trunc(x + 0.5)` rather than `Math.round`, which ADR-0007 bans so no
    // rounding decision anywhere can find its way onto money.
    return String(Math.trunc(value * factor + 0.5) / factor);
  };
  return `oklch(${round(colour.l, 3)} ${round(colour.c, 3)} ${round(colour.h, 1)})`;
}

/**
 * The ramp as a CSS rule, ready to go in a `<style>` tag.
 *
 * `html:root` rather than `:root`, deliberately. Both select the same element,
 * but `html:root` is one specificity point higher than the `:root` that
 * `@theme` generates — so this wins wherever the browser happens to order the
 * two stylesheets, instead of winning only if it happens to come second.
 */
export function brandThemeCss(ramp: BrandRamp): string {
  const declarations = BRAND_STEPS.map(
    (step) => `--color-brand-${String(step)}:${css(ramp.steps[step])}`,
  );

  declarations.push(
    `--color-steel-500:${css(ramp.steel500)}`,
    `--color-steel-600:${css(ramp.steel600)}`,
  );

  return `html:root{${declarations.join(';')}}`;
}
