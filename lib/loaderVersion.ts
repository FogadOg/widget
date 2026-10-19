/**
 * What the host page's loader can do, judged from the `loaderVersion` it put on
 * the iframe URL. Installs pin `widget-<ver>.js` with SRI, so a loader change
 * only reaches sites that re-paste their snippet: anything the iframe does that
 * needs a newer loader must check first and keep the old behaviour otherwise.
 *
 * The version is known from the first render, unlike the `capabilities` host
 * message, which arrives on iframe load and can lose the race with an early
 * auth failure.
 */

/** First loader that keeps its container hidden for a `hidden: true` WIDGET_ERROR. */
export const HIDDEN_ERROR_LOADER_VERSION = '0.1.8';

/** True when `version` is a release at or above `min`. Unknown, unbuilt ('__WIDGET_VERSION__') or malformed versions count as older. */
export function loaderAtLeast(version: unknown, min: string): boolean {
  // Typed as a string, but a repeated `?loaderVersion=` query param reaches the
  // page as an array, and calling .trim() on that crashed the whole widget into
  // its error boundary. A version check must never be able to do that.
  if (Array.isArray(version)) version = version[0];
  if (typeof version !== 'string' || !version) return false;
  const parse = (v: string) => v.trim().split('.').map((n) => Number.parseInt(n, 10));
  const have = parse(version);
  const need = parse(min);
  if (have.length < 2 || have.some((n) => Number.isNaN(n))) return false;
  for (let i = 0; i < Math.max(have.length, need.length); i++) {
    const a = have[i] ?? 0;
    const b = need[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}
