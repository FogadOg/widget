export const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Shared visible focus affordance (DESIGN_STANDARD §6: every interactive element
// gets a focus-visible ring). Ring/offset colors are supplied inline per-surface
// via --tw-ring-color / --tw-ring-offset-color so they contrast with the
// customer's brand colors instead of a fixed token.
export const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

// Minimum interactive target for widget chrome. The chat panel is predominantly
// a MOBILE surface, and its controls measured 24–28px square — comfortably
// mis-tappable. 44px is WCAG 2.5.5 (AAA) and the universal convention for a
// touch surface; the panel's own controls are the one place in the product
// where it is non-negotiable, so it is a constant rather than a per-site class.
// Pair with `justify-center items-center` so the glyph stays visually small.
export const TAP_TARGET = 'min-w-11 min-h-11';
