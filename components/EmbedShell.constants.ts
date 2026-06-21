export const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Shared visible focus affordance (DESIGN_STANDARD §6: every interactive element
// gets a focus-visible ring). Ring/offset colors are supplied inline per-surface
// via --tw-ring-color / --tw-ring-offset-color so they contrast with the
// customer's brand colors instead of a fixed token.
export const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
