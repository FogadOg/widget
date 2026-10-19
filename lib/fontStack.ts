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

// Valid only as the whole value: `inherit, sans-serif` is an invalid declaration.
const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/**
 * Split a font-family list on its top-level commas only. A plain `split(',')`
 * cut `"Acme, Inc Sans", sans-serif` into `"Acme` / ` Inc Sans"` and broke
 * `var(--brand, Inter)` apart.
 */
function splitFamilies(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  let depth = 0;
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function formatFamily(name: string): string {
  if (/^(['"]).*\1$/.test(name)) return name;
  if (KEYWORDS.has(name.toLowerCase())) return name;
  // `var(--brand-font)` and other functions are values, not names.
  if (/^[a-z-]+\(.*\)$/i.test(name)) return name;
  return `"${name.replace(/["\\]/g, '')}"`;
}

export function buildFontStack(fontFamily?: string | null): string {
  const value = (fontFamily ?? '').trim();
  if (CSS_WIDE_KEYWORDS.has(value.toLowerCase())) return value;
  const families = splitFamilies(value).map(formatFamily);
  return [...families, FALLBACK_FONT_STACK].join(', ');
}
