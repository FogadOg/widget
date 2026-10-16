/**
 * Turn a merchant's `font_family` into a CSS font-family list that can't fall
 * through to the browser's default serif.
 *
 * The shells apply `font_family` as an inline style, and an inline
 * `font-family` replaces the inherited stack outright — CSS does not merge the
 * two. So a bare `Inter` (the model default, with `font_source='system'`) on a
 * machine without Inter installed rendered as Times New Roman. Appending the
 * widget's own stack keeps the named font first and gives the browser a sans
 * fallback for everyone who doesn't have it (or while a web font loads).
 */

/** The widget's global sans stack (globals.css `--font-sans`), with a fallback for pages without it. */
export const FALLBACK_FONT_STACK = 'var(--font-sans, system-ui, sans-serif)';

// CSS generic families and the system-font keywords: quoting any of these
// would turn it into a (non-existent) family *name* and break it.
const KEYWORDS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'math', 'emoji', 'fangsong',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  '-apple-system', 'blinkmacsystemfont',
]);

function formatFamily(name: string): string {
  if (/^(['"]).*\1$/.test(name)) return name;
  if (KEYWORDS.has(name.toLowerCase())) return name;
  return `"${name.replace(/["\\]/g, '')}"`;
}

export function buildFontStack(fontFamily?: string | null): string {
  const families = (fontFamily ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(formatFamily);
  return [...families, FALLBACK_FONT_STACK].join(', ');
}
