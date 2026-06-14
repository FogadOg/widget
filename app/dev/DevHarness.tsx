'use client';

/**
 * DevHarness — interactive sandbox for the chat widget (see /dev).
 *
 * Embeds the same `/embed/session` iframe a real host page would, but with live
 * controls so you can flip locale / start-open / IDs without re-embedding on a
 * third-party site, watch postMessage traffic, and exercise the offline and
 * clear-session paths. Dev-only (the route 404s in production).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// localStorage keys for remembering the last-used IDs between reloads.
const LS_PREFIX = 'companin-devharness-';
const LOCALES = ['en', 'es', 'fr', 'de', 'nb', 'sv', 'da', 'nl', 'it', 'pt'];

type LogEntry = { id: number; at: number; dir: '←'; type: string; data: unknown };

function useStickyState(key: string, initial: string): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      return localStorage.getItem(LS_PREFIX + key) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: string) => {
      setValue(v);
      try {
        localStorage.setItem(LS_PREFIX + key, v);
      } catch {
        // ignore
      }
    },
    [key]
  );
  return [value, set];
}

export default function DevHarness() {
  const envDefaults = useMemo(
    () => ({
      clientId: process.env.NEXT_PUBLIC_DEV_CLIENT_ID ?? '',
      agentId: process.env.NEXT_PUBLIC_DEV_AGENT_ID ?? '',
      configId: process.env.NEXT_PUBLIC_DEV_CONFIG_ID ?? '',
    }),
    []
  );

  const [clientId, setClientId] = useStickyState('clientId', envDefaults.clientId);
  const [agentId, setAgentId] = useStickyState('agentId', envDefaults.agentId);
  const [configId, setConfigId] = useStickyState('configId', envDefaults.configId);
  const [locale, setLocale] = useStickyState('locale', 'en');
  const [startOpen, setStartOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  // Bumping this remounts the iframe (cheap, reliable reload).
  const [reloadKey, setReloadKey] = useState(0);
  // The src is only recomputed when "Apply & reload" is pressed, so editing a
  // field doesn't tear down the running widget on every keystroke.
  const [appliedAt, setAppliedAt] = useState(0);

  const [log, setLog] = useState<LogEntry[]>([]);
  const logSeq = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [offline, setOffline] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const iframeSrc = useMemo(() => {
    if (!origin) return '';
    const params = new URLSearchParams({
      clientId,
      agentId,
      configId,
      locale,
      startOpen: String(startOpen),
      parentOrigin: origin,
      pagePath: '/dev',
    });
    if (showOverlay) params.set('widget_debug', '1');
    return `${origin}/embed/session?${params.toString()}`;
    // appliedAt is a dependency so the src only changes on explicit apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, appliedAt]);

  const ready = clientId && agentId && configId;

  // Capture postMessage traffic coming back from the iframe (same origin in dev).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (origin && event.origin !== origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const type = (data as { type?: unknown }).type;
      if (typeof type !== 'string' || !type.startsWith('WIDGET_')) return;
      logSeq.current += 1;
      const entry: LogEntry = { id: logSeq.current, at: Date.now(), dir: '←', type, data };
      setLog((prev) => [...prev.slice(-199), entry]);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [origin]);

  const apply = useCallback(() => {
    setAppliedAt((n) => n + 1);
    setReloadKey((n) => n + 1);
  }, []);

  const reloadIframe = useCallback(() => setReloadKey((n) => n + 1), []);

  const clearSession = useCallback(() => {
    let removed = 0;
    try {
      Object.keys(localStorage)
        .filter((k) => (k.startsWith('companin-') || k.startsWith('companin_')) && !k.startsWith(LS_PREFIX))
        .forEach((k) => {
          localStorage.removeItem(k);
          removed += 1;
        });
    } catch {
      // ignore
    }
    // localStorage is shared with the same-origin iframe, so a reload starts fresh.
    reloadIframe();
    // eslint-disable-next-line no-console
    console.info(`[DevHarness] Cleared ${removed} widget storage keys.`);
  }, [reloadIframe]);

  // Toggle the iframe widget's connectivity. Best-effort: prefer the widget's
  // own simulateOffline() (also patches fetch) and always fire the browser
  // online/offline events the widget listens to.
  const toggleOffline = useCallback(() => {
    const next = !offline;
    setOffline(next);
    const cw = iframeRef.current?.contentWindow as
      | (Window & { CompaninWidget?: { simulateOffline?: () => void; restoreOnline?: () => void } })
      | null;
    try {
      if (next) cw?.CompaninWidget?.simulateOffline?.();
      else cw?.CompaninWidget?.restoreOnline?.();
    } catch {
      // cross-frame access can throw if not same-origin
    }
    try {
      cw?.dispatchEvent(new Event(next ? 'offline' : 'online'));
    } catch {
      // ignore
    }
  }, [offline]);

  const fieldStyle: React.CSSProperties = {
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 };
  const btnStyle: React.CSSProperties = {
    padding: '7px 12px',
    border: 'none',
    borderRadius: 6,
    background: '#2563eb',
    color: 'white',
    fontSize: 13,
    cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = { ...btnStyle, background: '#475569' };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#0f172a' }}>
      {/* Controls */}
      <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid #e2e8f0', padding: 16, overflowY: 'auto', background: '#f8fafc' }}>
        <h1 style={{ fontSize: 16, margin: '0 0 4px' }}>Widget Dev Harness</h1>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
          Embeds <code>/embed/session</code> like a real host page. Dev-only.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={labelStyle}>Client ID</label>
            <input style={fieldStyle} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="data-client-id" />
          </div>
          <div>
            <label style={labelStyle}>Agent ID</label>
            <input style={fieldStyle} value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="data-agent-id" />
          </div>
          <div>
            <label style={labelStyle}>Config ID</label>
            <input style={fieldStyle} value={configId} onChange={(e) => setConfigId(e.target.value)} placeholder="data-config-id" />
          </div>
          <div>
            <label style={labelStyle}>Locale</label>
            <select style={fieldStyle} value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={startOpen} onChange={(e) => setStartOpen(e.target.checked)} />
            Start open
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
            Show DevOverlay (<code>widget_debug=1</code>)
          </label>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button style={btnStyle} onClick={apply} disabled={!ready} title={ready ? '' : 'Fill in all three IDs first'}>
            Apply &amp; reload
          </button>
          <button style={btnSecondary} onClick={reloadIframe}>Reload iframe</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button style={btnSecondary} onClick={clearSession}>Clear session</button>
          <button
            style={{ ...btnSecondary, background: offline ? '#b45309' : '#475569' }}
            onClick={toggleOffline}
          >
            {offline ? 'Restore online' : 'Simulate offline'}
          </button>
        </div>

        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, lineHeight: 1.5 }}>
          Position, theme and most behaviour come from the dashboard config (<code>configId</code>),
          not from this harness. <code>startOpen</code> and <code>locale</code> are passed via the URL.
        </p>
      </div>

      {/* Stage + log */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, position: 'relative', background: '#ffffff', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
          {ready && iframeSrc ? (
            <iframe
              key={reloadKey}
              ref={iframeRef}
              src={iframeSrc}
              title="Widget under test"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 14 }}>
              Enter Client / Agent / Config IDs and press “Apply &amp; reload”.
            </div>
          )}
        </div>

        {/* postMessage log */}
        <div style={{ height: 200, borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', background: '#0f172a', color: '#e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <strong style={{ fontSize: 12, color: '#818cf8' }}>postMessage log ({log.length})</strong>
            <button
              style={{ background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
              onClick={() => setLog([])}
            >
              Clear
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, padding: '4px 0' }}>
            {log.length === 0 ? (
              <div style={{ padding: '8px 10px', color: '#475569' }}>No messages yet. The widget posts here as it loads.</div>
            ) : (
              log.map((e) => (
                <div key={e.id} style={{ padding: '2px 10px', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ color: '#64748b', minWidth: 64 }}>{new Date(e.at).toLocaleTimeString('en-US', { hour12: false })}</span>
                  <span style={{ color: '#34d399', minWidth: 12 }}>{e.dir}</span>
                  <span style={{ color: '#c7d2fe', minWidth: 150, fontWeight: 'bold' }}>{e.type}</span>
                  <span style={{ color: '#94a3b8', wordBreak: 'break-all' }}>
                    {(() => {
                      try {
                        return JSON.stringify((e.data as { data?: unknown }).data ?? e.data);
                      } catch {
                        return '[unserializable]';
                      }
                    })()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
