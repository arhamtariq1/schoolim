/**
 * Colour maths, so the palette's contrast can be asserted rather than eyeballed.
 *
 * docs/16 §6 makes 4.5:1 a rule, not an aspiration, and says it is verified.
 * This is what verifies it: the tokens in `@ilm/config/tailwind/theme.css` are
 * OKLCH, browsers do not expose a contrast API, and nobody can read a ratio off
 * a swatch. Without these functions "check the contrast" means "someone looked
 * at it once", which is how a brand refresh quietly drops a button's label
 * below the line.
 *
 * Björn Ottosson's OKLab conversion, then WCAG 2.1 relative luminance.
 */

export interface Oklch {
  /** Perceptual lightness, 0–1. */
  readonly l: number;
  /** Chroma. 0 is grey; ~0.15 is vivid at these lightnesses. */
  readonly c: number;
  /** Hue angle in degrees. */
  readonly h: number;
}

/** Linear-light sRGB channels, 0–1, before gamma encoding. */
type Rgb = readonly [number, number, number];

function encode(channel: number): number {
  const clamped = Math.max(channel, 0);
  const encoded =
    clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.min(1, Math.max(0, encoded));
}

/** OKLCH to gamma-encoded sRGB, each channel 0–1. Out-of-gamut values clamp. */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    encode(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    encode(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    encode(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  ];
}

/**
 * `#rrggbb`, for asserting that a token is the colour somebody asked for.
 *
 * `Math.trunc(x + 0.5)` rather than `Math.round`, which ADR-0007 bans outright
 * so that no rounding decision anywhere can quietly find its way onto money.
 * These are colour channels, but the rule does not carve out exceptions and a
 * lint suppression here would be one more place to check the next time it fires.
 */
export function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.trunc(channel * 255 + 0.5)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * WCAG contrast ratio between two colours, 1:1 to 21:1.
 *
 * Order-independent — the brighter is always the numerator — because "is this
 * legible" is not a question about which one you happened to pass first.
 */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const [brighter, darker] = [
    relativeLuminance(oklchToRgb(a)),
    relativeLuminance(oklchToRgb(b)),
  ].sort((x, y) => y - x);
  return ((brighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
