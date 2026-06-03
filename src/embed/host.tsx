/**
 * Sandboxed iframe host — reference embed snippet.
 *
 * Demonstrates how an integrator mounts the widget in a maximally sandboxed
 * iframe and establishes a postMessage handshake.
 *
 * The iframe uses:
 *   sandbox="allow-scripts"   — allows JS execution inside the iframe
 *                               but NOT allow-same-origin, so the widget
 *                               cannot access the host's cookies or storage.
 *   referrerpolicy="no-referrer" — prevents leaking the host URL.
 *
 * Usage (React):
 *   <WidgetHost
 *     widgetOrigin="https://widget.example.com"
 *     config={{ agentId: 'abc123' }}
 *   />
 */

'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { createHostHandshake, type InitMessage } from './handshake';

interface WidgetHostProps {
  /** Origin of the hosted widget (e.g. "https://widget.example.com") */
  widgetOrigin: string;
  /** Config forwarded to the widget via the INIT postMessage */
  config?: Record<string, unknown>;
  /** Full URL to the widget iframe entry page */
  widgetUrl?: string;
  className?: string;
  title?: string;
}

export function WidgetHost({
  widgetOrigin,
  config = {},
  widgetUrl,
  className,
  title = 'Agent Widget',
}: WidgetHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState<number>(600);
  const hsRef = useRef<ReturnType<typeof createHostHandshake> | null>(null);

  const src = widgetUrl ?? `${widgetOrigin}/embed/widget`;

  const initHandshake = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const hs = createHostHandshake({ iframe, widgetOrigin });
    hsRef.current = hs;

    hs.on('READY', (msg) => {
      // Echo the handshake token back with the host config
      hs.sendInit(msg.handshakeToken, config);
    });

    hs.on('RESIZE', (msg) => {
      setHeight(msg.height);
    });

    hs.on('ERROR', (msg) => {
      console.error('[WidgetHost] Widget error', msg.code, msg.detail);
    });
  }, [widgetOrigin, config]);

  useEffect(() => {
    initHandshake();
    return () => {
      // Cleanup: postMessage listeners are tied to the window, not the iframe
      // Re-mounting will call initHandshake again with a fresh hs instance.
    };
  }, [initHandshake]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      width="100%"
      height={height}
      // Critical: no allow-same-origin → widget cannot read host cookies/storage
      sandbox="allow-scripts allow-forms"
      referrerPolicy="no-referrer"
      loading="lazy"
      className={className}
      style={{ border: 'none', overflow: 'hidden' }}
    />
  );
}

export default WidgetHost;
