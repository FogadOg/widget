/**
 * Widget embed entrypoint.
 *
 * This module bootstraps the widget when loaded inside a sandboxed iframe.
 * It:
 *  1. Establishes the postMessage handshake with the host page.
 *  2. Waits for the INIT message with the host-provided config.
 *  3. Renders the widget with that config.
 *
 * Mount this via the /embed/widget page route.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { createHandshake } from './handshake';
import { t as translate } from '../../lib/i18n';

interface EmbedConfig {
  agentId?: string;
  theme?: 'light' | 'dark';
  locale?: string;
  [key: string]: unknown;
}

interface EmbedEntryProps {
  /** Origins that are allowed to send messages to the widget */
  allowedOrigins?: string[];
}

export function EmbedEntry({ allowedOrigins = [] }: EmbedEntryProps) {
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Derive allowed origins from env at runtime if not explicitly provided
    const origins: string[] = allowedOrigins.length
      ? allowedOrigins
      : (process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);

    // In dynamic mode (EMBED_ALLOWLIST_MODE=dynamic, the default) no origin list is
    // configured here — any HTTPS site can embed the widget and per-customer
    // authorization is enforced by the JWT token at the API layer instead.
    if (origins.length === 0) {
      console.warn('[EmbedEntry] No allowed origins configured. All origins are permitted in dynamic mode.');
    }

    const hs = createHandshake({ allowedOrigins: origins });

    hs.on('INIT', (msg) => {
      setConfig(msg.config as EmbedConfig);
      setReady(true);
    });

    hs.on('PING', () => {
      // Respond to host keep-alive pings
      window.parent.postMessage({ type: 'PONG' }, '*');
    });

    // Signal to the host page that the widget is ready for INIT
    hs.sendReady();

    // Notify host of initial height
    hs.sendResize(document.documentElement.scrollHeight);

    // Observe size changes
    const ro = new ResizeObserver(() => {
      hs.sendResize(document.documentElement.scrollHeight);
    });
    ro.observe(document.body);

    return () => ro.disconnect();
  }, [allowedOrigins]);

  if (!ready || !config) {
    return (
      <div
        role="status"
        aria-label={translate('en', 'widgetLoadingAriaLabel')}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}
      >
        <span className="sr-only">{translate('en', 'widgetLoading')}</span>
      </div>
    );
  }

  return (
    <div data-widget-config={JSON.stringify({ agentId: config.agentId })}>
      {/* Lazy-import the full widget shell so the embed entrypoint stays small */}
      <WidgetShell config={config} />
    </div>
  );
}

// Lazy-loaded widget shell placeholder —
// replace with the actual widget component when integrating.
function WidgetShell({ config }: { config: EmbedConfig }) {
  return (
    <div className="widget-shell" data-agent-id={config.agentId ?? ''} />
  );
}

// Development only: when webpack HMR re-applies this module inside the iframe,
// signal the host page so it can reload just the iframe instead of leaving a
// stale widget on screen. Uses the webpack `module.hot` API (a plain identifier,
// so it parses under jest's CommonJS transform); no-ops where HMR is absent
// (production, Turbopack, tests), and only posts when actually framed.
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  const mod = (typeof module !== 'undefined' ? module : undefined) as
    | { hot?: { addStatusHandler: (cb: (status: string) => void) => void } }
    | undefined;
  if (mod?.hot) {
    mod.hot.addStatusHandler((status: string) => {
      if (status === 'idle' && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'WIDGET_HMR_RELOAD' }, '*');
        } catch {
          // host page may be navigating
        }
      }
    });
  }
}

export default EmbedEntry;
