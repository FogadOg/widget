/**
 * bootstrap.ts — Widget auto-wiring module
 *
 * Runs side-effects that should happen exactly once when the widget package
 * is first loaded:
 *
 *  1. Detects debug mode (URL param / localStorage / script attribute) and
 *     logs a confirmation when active so developers know it worked.
 *
 *  2. Attaches `enableDebug` / `disableDebug` / `isDebugActive` onto
 *     `window.CompaninWidget` so they are reachable from the browser console
 *     without any extra imports:
 *
 *       window.CompaninWidget.enableDebug()   // ← works immediately
 *       window.CompaninWidget.disableDebug()
 *       window.CompaninWidget.isDebugActive() // → true / false
 *
 *  3. Re-exports `DevOverlay` so consumers can conditionally render it:
 *
 *       import { DevOverlay, useDebugMode } from '@yourco/widget/bootstrap';
 *       // or use the re-export from the package root (src/index.ts)
 *
 * This module is imported by `src/index.ts` for its side-effects, and can
 * also be imported directly by host apps that need the `DevOverlay` component.
 *
 * Safe to import in SSR contexts — all `window` access is guarded.
 */

import { detectDebugMode, enableDebug, disableDebug } from './components/DevOverlay';
import { simulateOffline, restoreOnline, isSimulatedOffline } from './components/DevOverlay';
import { listInstances } from './lib/widgetRegistry';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// 1. Log debug-mode activation
// ---------------------------------------------------------------------------

if (detectDebugMode()) {
  logger.info('Debug mode active — DevOverlay can now be rendered');
}

// ---------------------------------------------------------------------------
// 2. Attach debug helpers to window.CompaninWidget
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  // Preserve any existing properties (e.g. set by docs-widget.js or the host)
  const win = window as unknown as Record<string, unknown>;
  const existing = win.CompaninWidget as Record<string, unknown> | undefined;

  /**
   * Dump a snapshot of live widget state to the console as a table. Lets a
   * developer inspect every mounted instance without opening React DevTools.
   */
  const dumpState = () => {
    const instances = listInstances();
    // eslint-disable-next-line no-console
    console.table(
      instances.map((w) => ({
        instanceId: w.instanceId,
        clientId: w.clientId ?? '',
        agentId: w.agentId ?? '',
        state: w.state ?? '',
      }))
    );
    // eslint-disable-next-line no-console
    console.info('[Widget] instances:', instances.length, '· debugActive:', detectDebugMode(), '· offlineSimulated:', isSimulatedOffline());
    return instances;
  };

  /**
   * Wipe all widget-owned localStorage keys (sessions, visitor IDs, telemetry
   * flags, unread counters) so the widget starts completely fresh on reload.
   * Keys are namespaced with the `companin-` / `companin_` prefix.
   */
  const clearSession = () => {
    let removed = 0;
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('companin-') || k.startsWith('companin_'))
        .forEach((k) => {
          localStorage.removeItem(k);
          removed += 1;
        });
    } catch {
      // localStorage may be unavailable in a sandboxed iframe
    }
    // eslint-disable-next-line no-console
    console.info(`[Widget] Session cleared (${removed} keys removed). Reload the page.`);
    return removed;
  };

  win.CompaninWidget = {
    ...existing,
    enableDebug,
    disableDebug,
    isDebugActive: detectDebugMode,
    // Console inspection helpers (see DEV_EXPERIENCE.md)
    dumpState,
    clearSession,
    listInstances,
    // Simulated-offline controls — patch fetch() inside the iframe without
    // blocking the whole host page the way DevTools "Offline" mode would.
    simulateOffline,
    restoreOnline,
    isSimulatedOffline,
  };
}

// ---------------------------------------------------------------------------
// Re-exports (convenience — host apps can import from here directly)
// ---------------------------------------------------------------------------

export { detectDebugMode, enableDebug, disableDebug } from './components/DevOverlay';
export { default as DevOverlay } from './components/DevOverlay';
export { useDebugMode } from './components/DevOverlay';
