/**
 * CSS sanitizer for customer-supplied widget styling (LAUNCH-READINESS.md #9).
 *
 * Widget operators can submit arbitrary CSS via the dashboard customizer; the
 * embed iframe then injects it via <style>. The previous sanitizer only handled
 * @import / expression() / javascript: data: in url(), which left several real
 * exfiltration and clickjacking vectors open:
 *   - background: url(http://attacker.com/track.png) — fires a request on render
 *   - @font-face { src: url(http://attacker.com/font) }
 *   - position: fixed / sticky overlays covering the host page
 *   - unicode-escape bypasses (e.g. url(\6Aavascript:...))
 *
 * Approach:
 *   - Decode CSS unicode escapes BEFORE running regex strippers, so bypasses
 *     using \6A or similar resolve to their literal character first.
 *   - Strip every url(...) call. The customizer UI exposes background images
 *     via dedicated config fields (which the API can validate server-side);
 *     customers don't need raw url() in custom CSS.
 *   - Strip @import, @font-face, @namespace, and @charset entirely.
 *   - Strip declarations of position: fixed / sticky / absolute and `behavior:`.
 *   - Strip IE expression(), -moz-binding, and any `<` / `>` characters that
 *     could escape a <style> block.
 *
 * The sanitizer is intentionally aggressive: false positives just mean the
 * operator has to use the structured config UI for that style. False negatives
 * are XSS / data-exfiltration risks, so we err on the strict side.
 */

const UNICODE_ESCAPE_RE = /\\([0-9a-fA-F]{1,6})\s?/g;

/** Decode CSS unicode escapes (\6A ↦ "j") so later regex strippers can't be
 *  bypassed by encoding `url(` or `javascript:` character-by-character. */
function decodeCssEscapes(input: string): string {
  return input.replace(UNICODE_ESCAPE_RE, (_, hex) => {
    const code = parseInt(hex, 16);
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff) return '';
    try {
      return String.fromCodePoint(code);
    } catch {
      return '';
    }
  });
}

/** Patterns that get stripped regardless of where they appear in the CSS. */
const STRIP_PATTERNS: ReadonlyArray<RegExp> = [
  // At-rules that fetch external resources or change scoping.
  /@import\b[^;{}]*;?/gi,
  /@font-face\s*\{[^}]*\}/gi,
  /@namespace\b[^;{}]*;?/gi,
  /@charset\b[^;{}]*;?/gi,
  // All url() references — neutralized to url() so the rule remains syntactically valid.
  /url\s*\([^)]*\)/gi,
  // Legacy IE / Moz hooks that can run JS.
  /expression\s*\([^)]*\)/gi,
  /-moz-binding\s*:[^;}]*/gi,
  // Positioning that can be used to overlay or clickjack the host page.
  /position\s*:\s*(?:fixed|sticky|absolute)\s*!?\s*(?:important)?\s*;?/gi,
  // IE 'behavior' property runs scripts via HTC files.
  /behavior\s*:[^;}]*/gi,
  // Disallow raw angle brackets so the value can't break out of <style>.
  /[<>]/g,
];

/** Default cap on customer CSS payload size (defense against the URL-query
 *  payload pipeline filling local memory before the iframe even loads). */
const MAX_CSS_LENGTH = 16 * 1024; // 16 KiB

export function sanitizeCss(css: string | undefined): string {
  if (!css) return '';
  if (typeof css !== 'string') return '';

  // Cap length up front. A real-world widget skin tops out around 2-3 KiB.
  const raw = css.length > MAX_CSS_LENGTH ? css.slice(0, MAX_CSS_LENGTH) : css;

  let decoded = decodeCssEscapes(raw);

  for (const pattern of STRIP_PATTERNS) {
    decoded = decoded.replace(pattern, '');
  }

  // Collapse double-semicolons / orphan whitespace introduced by stripping.
  decoded = decoded.replace(/;{2,}/g, ';').replace(/[\t ]{2,}/g, ' ').trim();

  return decoded;
}
