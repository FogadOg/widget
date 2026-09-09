// =============================================================================
// Shared loader helpers for widget.js and docs-widget.js.
//
// These two loaders were ~72% textually duplicated. Anything that was identical
// in both lives here now; anything that differed only by a label or a global key
// is exposed as a small factory rather than being copied with one word changed.
// A security fix to isTrustedWidgetOrigin used to need applying twice.
//
// This file is bundled into each loader by scripts/build-embed.js (esbuild with
// bundle: true), so the shipped artifacts stay single, self-contained files —
// which the SRI pinning in customer snippets requires.
//
// NOTE: WIDGET_VERSION deliberately stays in each entry file. build-embed.js
// substitutes '__WIDGET_VERSION__' textually in the entry source only, and that
// pass does not reach imported modules.
// =============================================================================

export const STORAGE_PREFIX = 'companin-';
export const WIDGET_SCRIPT_ID = 'companin-widget';
export const COMPANY_NAME = 'Companin';
export const BASE_WIDGET_HOST = 'https://widget.companin.tech';
export const WIDGET_HOST_SUFFIXES = ['companin.tech'];

/**
 * True only for origins we're willing to exchange postMessage traffic with.
 *
 * Matches a host suffix by descent (apex or subdomain), never by substring —
 * "evilcompanin.tech" must not match "companin.tech".
 */
export function isTrustedWidgetOrigin(origin, allowInsecure) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const u = new URL(origin);
    if (!u.host) return false;
    if (!allowInsecure && u.protocol !== 'https:') return false;
    const host = u.host.toLowerCase();
    for (let i = 0; i < WIDGET_HOST_SUFFIXES.length; i++) {
      const suffix = WIDGET_HOST_SUFFIXES[i];
      if (host === suffix || host.endsWith('.' + suffix)) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export const sanitizeInstanceId = (value) =>
  String(value || 'default').replace(/[^a-zA-Z0-9_-]/g, '-');

/**
 * Registry of live widget instances, kept on `window` under `registryKey` so a
 * second copy of the loader finds the same one. The two loaders keep separate
 * registries (chat vs docs), hence the key parameter.
 */
export function createRegistryAccessor(registryKey) {
  return () => {
    if (!window[registryKey] || typeof window[registryKey] !== 'object') {
      window[registryKey] = {};
    }
    return window[registryKey];
  };
}

/**
 * Error buffer + logger. `label` distinguishes the two loaders in console output
 * ("Widget Error:" vs "Docs Widget Error:").
 *
 * Returns the array itself, not a copy — the public getErrors() reads it live.
 */
export function createErrorLog(label) {
  const errors = [];
  const logError = (message, context) => {
    const error = {
      timestamp: new Date().toISOString(),
      message,
      context,
    };
    errors.push(error);
    console.error(COMPANY_NAME + ' ' + label + ':', message, context);
  };
  return { errors, logError };
}
