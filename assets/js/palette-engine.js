/**
 * Palette domain logic.
 *
 * This module deliberately has no DOM dependencies so color calculations can be
 * tested in Node and reused by other front ends without a browser UI.
 */

/** Exact palette used when the seed is too dark to produce a useful scale. */
export const DEFAULT_PALETTE = [
  ['BrandPrimary100', '#F5F5F5'],
  ['BrandPrimary200', '#E6E6E6'],
  ['BrandPrimary300', '#D6D6D6'],
  ['BrandPrimary400', '#A5A5A5'],
  ['BrandPrimary500', '#767676'],
  ['BrandPrimary600', '#575757'],
  ['BrandPrimary700', '#434343'],
  ['BrandPrimary800', '#292929'],
  ['BrandPrimary900', '#1A1A1A'],
  ['BrandPrimary1000', '#000000']
];

/** Ordered shade steps; the input seed always occupies shade 600. */
export const SHADES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

/**
 * Palette generation thresholds and curve settings.
 * Keep these values centralized so algorithm tuning is easy to review.
 */
export const LOW_BRIGHTNESS_FALLBACK_THRESHOLD = 20;
export const DARK_REDUCTION_MIN = 40;
export const DARK_REDUCTION_MAX = 45;
export const DARK_REDUCTION_RAMP_START = 60;
export const DARK_REDUCTION_RAMP_END = 65;

/**
 * Validate and normalize a six-digit RGB hexadecimal color.
 *
 * @param {string} value Color in `RRGGBB` or `#RRGGBB` form.
 * @returns {string} Uppercase color with a leading hash.
 * @throws {Error} When the value is not a six-digit RGB hexadecimal color.
 */
export function normalizeHex(value) {
  const normalized = String(value ?? '').trim();
  const withHash = normalized.startsWith('#') ? normalized : `#${normalized}`;

  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) {
    throw new Error('Enter a valid six-digit hex color, such as #6750A4.');
  }

  return withHash.toUpperCase();
}

/** Convert a validated hexadecimal color into integer RGB channels. */
export function hexToRgb(hex) {
  const normalized = normalizeHex(hex).slice(1);

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

/**
 * Convert RGB hex to HSB/HSV.
 * Brightness is the maximum RGB channel expressed as a percentage.
 */
export function rgbToHsb(hex) {
  const { r: red, g: green, b: blue } = hexToRgb(hex);
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }

  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: max === 0 ? 0 : (delta / max) * 100,
    b: max * 100
  };
}

/** Convert HSB/HSV values to a six-digit uppercase RGB hexadecimal color. */
export function hsbToHex(hue, saturation, brightness) {
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const v = Math.max(0, Math.min(100, brightness)) / 100;
  const chroma = v * s;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = v - chroma;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = chroma;
    g = secondary;
  } else if (hue < 120) {
    r = secondary;
    g = chroma;
  } else if (hue < 180) {
    g = chroma;
    b = secondary;
  } else if (hue < 240) {
    g = secondary;
    b = chroma;
  } else if (hue < 300) {
    r = secondary;
    b = chroma;
  } else {
    r = chroma;
    b = secondary;
  }

  const toByte = channel => Math.round((channel + offset) * 255)
    .toString(16)
    .padStart(2, '0');

  return `#${toByte(r)}${toByte(g)}${toByte(b)}`.toUpperCase();
}

/**
 * Generate the ten BrandPrimary shades.
 *
 * Algorithm contract:
 * - Shade 600 is always the normalized input seed.
 * - Very dark seeds use the exact approved fallback palette.
 * - Lighter shades follow the reference-calibrated brightness/saturation curve.
 * - Darker shades preserve hue and saturation while reducing brightness in four
 *   equal steps. The total reduction ramps from 40 to 45 points between 60–65% B.
 *
 * @param {string} seed Seed color for BrandPrimary600.
 * @param {number} threshold Saturation threshold used by the low-saturation rule.
 * @returns {{ colors: Array<{name: string, hex: string}>, mode: string, hsb: {h: number, s: number, b: number}, reason: string }}
 */
export function generate(seed, threshold) {
  const normalizedSeed = normalizeHex(seed);
  const hsb = rgbToHsb(normalizedSeed);
  const lowSaturation = hsb.s < threshold;
  const lowBrightness = hsb.b < LOW_BRIGHTNESS_FALLBACK_THRESHOLD;

  // A very dark seed leaves too little useful range for a readable ten-step ramp.
  if (lowBrightness) {
    return {
      colors: DEFAULT_PALETTE.map(([name, hex]) => ({ name, hex })),
      mode: 'fallback',
      hsb,
      reason: `Seed brightness ${hsb.b.toFixed(1)}% is below ${LOW_BRIGHTNESS_FALLBACK_THRESHOLD}%. Exact default palette used.`
    };
  }

  const colorsByShade = { 600: normalizedSeed };
  const highBrightness = hsb.b > 72;
  const lightBrightnessByShade = {
    500: 82,
    400: 87,
    300: 92,
    200: 96,
    100: 99.6
  };
  const saturationFactorByShade = {
    500: 1,
    400: 0.70,
    300: 0.44,
    200: 0.22,
    100: 0.092
  };

  // Lighter shades preserve the seed hue and taper saturation toward near-white.
  for (const shade of [500, 400, 300, 200, 100]) {
    let brightness = lightBrightnessByShade[shade];

    if (highBrightness) {
      const remainingRange = 99.6 - hsb.b;
      const highSeedRamp = {
        500: hsb.b,
        400: hsb.b + remainingRange * 0.25,
        300: hsb.b + remainingRange * 0.5,
        200: hsb.b + remainingRange * 0.75,
        100: 99.6
      };
      brightness = highSeedRamp[shade];
    }

    const shade500Saturation = Math.min(hsb.s * 1.09, 71);
    let saturation = Math.min(100, shade500Saturation * saturationFactorByShade[shade]);

    if (lowSaturation) {
      // Neutral/low-saturation seeds should not gain color saturation in lighter shades.
      saturation = hsb.s;
    }

    colorsByShade[shade] = hsbToHex(hsb.h, saturation, brightness);
  }

  const rampProgress = Math.max(0, Math.min(
    1,
    (hsb.b - DARK_REDUCTION_RAMP_START) /
      (DARK_REDUCTION_RAMP_END - DARK_REDUCTION_RAMP_START)
  ));
  const darkReduction = DARK_REDUCTION_MIN +
    (DARK_REDUCTION_MAX - DARK_REDUCTION_MIN) * rampProgress;
  const darkTarget = Math.max(0, hsb.b - darkReduction);
  const darkStep = (hsb.b - darkTarget) / 4;

  for (const [index, shade] of [700, 800, 900, 1000].entries()) {
    const brightness = hsb.b - darkStep * (index + 1);
    colorsByShade[shade] = hsbToHex(hsb.h, hsb.s, brightness);
  }

  const reason = lowSaturation
    ? `Low saturation (${hsb.s.toFixed(1)}%): lighter shades adjust brightness only.`
    : 'Lighter shades use the reference-calibrated curve; darker shades use four equal steps and a 40–45 point reduction.';

  return {
    colors: SHADES.map(shade => ({
      name: `BrandPrimary${shade}`,
      hex: colorsByShade[shade]
    })),
    mode: 'generated',
    hsb,
    reason
  };
}
