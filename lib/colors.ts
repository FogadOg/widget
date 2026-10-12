// Utility functions for color manipulation and validation

// WCAG relative luminance helpers
const sRGBtoLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export const getRelativeLuminance = (hex: string): number => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0;
  return 0.2126 * sRGBtoLinear(parseInt(m[1], 16))
       + 0.7152 * sRGBtoLinear(parseInt(m[2], 16))
       + 0.0722 * sRGBtoLinear(parseInt(m[3], 16));
};

// Returns '#000000' or '#ffffff', whichever achieves the higher contrast ratio
// against the given background. Uses WCAG relative-luminance formula.
export const getReadableTextColor = (bg: string): '#000000' | '#ffffff' => {
  const L = getRelativeLuminance(bg);
  const whiteContrast = 1.05 / (L + 0.05);
  const blackContrast = (L + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
};

// Validates a hex color and returns the normalized value or a fallback
export const normalizeHexColor = (color: string | undefined, fallback: string): string => {
  if (typeof color !== 'string') return fallback;
  const trimmed = color.trim();

  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
};

// Convert a 6‑digit hex code to "r, g, b" string. Returns white on failure.
export const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(
        result[3],
        16
      )}`
    : '255, 255, 255';
};

// Returns an rgba() string for the given hex color at the requested alpha.
// Used to derive theme-aware neutrals (muted text, hairline borders, skeletons)
// from the customer's configured text/background colors instead of hardcoding
// gray shades that break on dark or branded themes.
//
// NOTE: this applies the alpha blindly. Where the result carries meaning a
// visitor must be able to READ — secondary text, a form-control boundary — use
// `mutedOn()` below instead, which guarantees a contrast floor. `withAlpha` is
// still correct for purely decorative washes (skeletons, hover tints, code
// block backgrounds) where no contrast requirement applies.
export const withAlpha = (hex: string, alpha: number): string => {
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
};

// ── Contrast-floored neutrals ───────────────────────────────────────────────
// A fixed alpha clears WCAG on the default near-black-on-white theme and
// collapses on a mid-luminance branded one. Measured on a live tenant: footer
// text at alpha 0.6 scored 3.31:1 (needs 4.5) and the composer's border at
// alpha 0.12 scored 1.23:1 (needs 3 under WCAG 1.4.11, as the only boundary of
// a text input). `mutedOn` keeps the same visual intent — start at the alpha
// the design asks for — but walks it up until the composited result clears the
// floor, so no theme can produce an unreadable widget.

const parseHex = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
    : [0, 0, 0];
};

const luminanceOf = (rgb: [number, number, number]): number =>
  0.2126 * sRGBtoLinear(rgb[0]) + 0.7152 * sRGBtoLinear(rgb[1]) + 0.0722 * sRGBtoLinear(rgb[2]);

/** WCAG 2.x contrast ratio between two opaque sRGB colors. */
export const contrastRatio = (
  a: [number, number, number],
  b: [number, number, number]
): number => {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** WCAG 2.x contrast ratio between two hex colors. */
export const contrastRatioHex = (aHex: string, bHex: string): number =>
  contrastRatio(parseHex(aHex), parseHex(bHex));

const composite = (
  fg: [number, number, number],
  bg: [number, number, number],
  alpha: number
): [number, number, number] => [
  fg[0] * alpha + bg[0] * (1 - alpha),
  fg[1] * alpha + bg[1] * (1 - alpha),
  fg[2] * alpha + bg[2] * (1 - alpha),
];

/**
 * `fg` faded over `bg`, starting at `alpha` and raised until the composited
 * result clears `minRatio` against `bg`.
 *
 * If `fg` at full opacity still cannot reach the floor (a merchant set a text
 * color nearly equal to their background), falls back to whichever of
 * black/white is readable on `bg` — a visible color always beats a tasteful
 * invisible one.
 *
 * @param minRatio 4.5 for body text, 3 for large text, icons and the boundary
 *                 of a form control (WCAG 1.4.3 / 1.4.11).
 */
export const mutedOn = (
  fgHex: string,
  bgHex: string,
  alpha: number,
  minRatio: number
): string => {
  const fg = parseHex(fgHex);
  const bg = parseHex(bgHex);

  if (contrastRatio(fg, bg) < minRatio) {
    return getReadableTextColor(bgHex);
  }

  let a = Math.min(1, Math.max(0, alpha));
  while (a < 1 && contrastRatio(composite(fg, bg, a), bg) < minRatio) {
    a = Math.min(1, a + 0.02);
  }
  return `rgba(${fg.join(', ')}, ${Number(a.toFixed(2))})`;
};

/**
 * Linear blend of two hex colors in RGB. `t=0` → `a`, `t=1` → `b`.
 * Mirrors `mixHex` in assistant/utils/color.ts.
 *
 * Used to turn a translucent wash into the concrete surface it produces, so a
 * contrast floor can be computed against what the eye actually sees rather
 * than against the page behind it.
 */
export const mixHex = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${h(lerp(ar, br))}${h(lerp(ag, bg))}${h(lerp(ab, bb))}`;
};
