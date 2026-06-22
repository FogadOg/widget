import { sanitizeCss } from '../../../lib/cssValidator';
import { logError } from '../../../lib/errorHandling';

// helpers exposed so tests can call them directly
export function injectCustomAssets(css?: string) {
  try {
    if (css) {
      let safe: string | undefined = undefined;
      try {
        safe = sanitizeCss(css);
      } catch (err) {
        logError(err as Error, { action: 'injectCustomAssets', css });
        return;
      }
      if (!safe) {
        logError('sanitizeCss returned falsy', { action: 'injectCustomAssets', css });
        return;
      }
      const style = document.createElement('style');
      style.textContent = safe;
      document.head.appendChild(style);
    }
  } catch (err) {
    logError(err as Error, { action: 'injectCustomAssets', css });
  }
}

export function applyCustomAssetsFromQuery(search?: string) {
  // Legacy path retained so customers with old snippets keep working until they
  // migrate. New deployments serve custom_css via WidgetConfig (#20). We keep
  // sanitizeCss on the URL-supplied value because the hardened sanitizer still
  // strips dangerous patterns even when consumed from an untrusted URL.
  try {
    const src = search ?? window.location.search;
    const params = new URLSearchParams(src);
    const css = params.get('customCss');
    if (css) {
      injectCustomAssets(decodeURIComponent(css));
    }
  } catch (err) {
    logError(err, { action: 'applyCustomAssetsFromQuery', search });
  }
}

// Validates that an inbound postMessage actually originates from the host page
// we expect, mirroring the check used by the main HOST_MESSAGE handler. Used to
// gate sensitive inbound commands (consent, debug) so a malicious framing page
// cannot forge them. Under dynamic embed-allowlist mode any HTTPS site can frame
// the widget, so this check is the authoritative gate for inbound messages.
export function isTrustedParentMessage(
  event: MessageEvent,
  expectedOrigin: string | null | undefined,
): boolean {
  if (typeof window === 'undefined' || window.parent === window) return false;
  // Tests dispatch plain objects whose `source` is not window.parent; in that
  // case fall back to matching the expected origin.
  if (event.source === window.parent) return true;
  if (!expectedOrigin) return false;
  if (expectedOrigin !== '*' && event.origin !== expectedOrigin) return false;
  return true;
}

// New path: inject custom CSS sourced from the loaded widget configuration.
// The dashboard already persists `custom_css` server-side (WidgetConfig.custom_css);
// the embed page reads it after fetchWidgetConfig succeeds.
export function injectCustomAssetsFromConfig(config: { custom_css?: string | null } | null | undefined) {
  if (!config) return;
  const css = config.custom_css || undefined;
  if (css) injectCustomAssets(css);
}

// Inject a Google Fonts stylesheet for the configured font family.
// Called when font_source === 'google' so the font is available inside the iframe.
export function injectGoogleFont(fontFamily: string) {
  if (!fontFamily || typeof document === 'undefined') return;
  try {
    const id = `gf-${fontFamily.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(id)) return; // already loaded
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
  } catch (err) {
    logError(err as Error, { action: 'injectGoogleFont', fontFamily });
  }
}
