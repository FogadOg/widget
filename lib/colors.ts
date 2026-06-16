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
export const withAlpha = (hex: string, alpha: number): string => {
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
};
