'use client';

/**
 * DevOverlay — lightweight debug panel rendered only in dev/debug mode.
 *
 * Activation sources (any one enables it):
 *   1. Script attribute:   <script data-dev="true" ...>
 *   2. URL query param:    ?widget_debug=1
 *   3. localStorage key:   localStorage.setItem('widget_debug', '1')
 *   4. Runtime API:        window.CompaninWidget?.enableDebug()
 *
 * The overlay shows recent API requests/responses, emitted events, last
 * error, approximate render timings, and clear/persist toggles.
 *
 * Import and render at the widget root when debug mode is active:
 *   {isDebug && <DevOverlay events={events} />}
 */

import React, { useEffect, useReducer, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DevEvent = {
  id: string;
  at: number;
  kind: 'api-request' | 'api-response' | 'event' | 'error' | 'render';
  label: string;
  data?: unknown;
};

export type DevPanelTab = 'events' | 'timeline' | 'state' | 'errors' | 'timings';

/**
 * Live widget-state snapshot surfaced in the DevOverlay "State" tab. The widget
 * (EmbedClient) pushes updates via {@link reportDevState}; the overlay renders
 * whatever fields are present. All fields optional so callers report partials.
 */
export type DevState = {
  sessionId?: string | null;
  clientId?: string | null;
  agentId?: string | null;
  configId?: string | null;
  /** Handshake progress, e.g. 'INIT' → 'READY' → 'CONNECTED'. */
  handshake?: string;
  /** Epoch-ms expiry of the current auth token (drives the countdown). */
  authTokenExpiresAt?: number | null;
  /** Real browser offline state (navigator.onLine === false). */
  offline?: boolean;
  /** Number of messages in the current session. */
  messageCount?: number;
  /** Config values fetched from the backend (rendered collapsed). */
  config?: Record<string, unknown> | null;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Debug mode detection
// ---------------------------------------------------------------------------

/**
 * Detect whether debug mode should be enabled based on the environment.
 * Safe to call server-side (returns false when window is undefined).
 *
 * Activation sources (checked in order):
 *  1. URL query param: ?widget_debug=1
 *  2. localStorage:    localStorage.setItem('widget_debug', '1')
 *  3. Script attribute: <script data-client-id="..." data-dev="true">
 *     (set via NEXT_PUBLIC_WIDGET_DEV=true in the *host* app, e.g. the agent)
 */
export function detectDebugMode(): boolean {
  // Intentionally NOT gated to non-production: integrators need to debug live
  // embeds via ?widget_debug=1 / localStorage / chat.enableDebug(). Every
  // activation source is local to the visitor's own browser and the overlay
  // only ever shows that visitor their own session — no cross-user exposure.
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('widget_debug') === '1') return true;
  } catch {
    // ignore
  }
  try {
    if (localStorage.getItem('widget_debug') === '1') return true;
  } catch {
    // ignore
  }
  // Check all widget script tags for data-dev attribute
  try {
    const scripts = document.querySelectorAll<HTMLScriptElement>(
      'script[data-client-id]',
    );
    for (const s of scripts) {
      if (s.dataset.dev && s.dataset.dev !== 'false') return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// ---------------------------------------------------------------------------
// Runtime debug toggle API
// ---------------------------------------------------------------------------

const DEBUG_STORAGE_KEY = 'widget_debug';
const DEBUG_CHANGE_EVENT = 'companin:debug:change';

/**
 * Enable debug mode at runtime — no page reload required.
 *
 * Sets `localStorage.widget_debug = '1'` and fires a
 * `'companin:debug:change'` CustomEvent so any listening component can
 * react immediately.
 *
 * Wire onto the host API:
 *   window.CompaninWidget.enableDebug = enableDebug;
 */
export function enableDebug(): void {
  try { localStorage.setItem(DEBUG_STORAGE_KEY, '1'); } catch { /* ignore */ }
  try {
    window.dispatchEvent(
      new CustomEvent(DEBUG_CHANGE_EVENT, { detail: { enabled: true } })
    );
  } catch { /* ignore */ }
}

/**
 * Disable debug mode at runtime.
 *
 * Clears the localStorage key and fires `'companin:debug:change'`.
 */
export function disableDebug(): void {
  try { localStorage.removeItem(DEBUG_STORAGE_KEY); } catch { /* ignore */ }
  try {
    window.dispatchEvent(
      new CustomEvent(DEBUG_CHANGE_EVENT, { detail: { enabled: false } })
    );
  } catch { /* ignore */ }
}

/**
 * React hook that tracks debug mode state reactively — re-renders the
 * consuming component when `enableDebug()` / `disableDebug()` is called.
 *
 * @example
 *   function WidgetRoot() {
 *     const isDebug = useDebugMode();
 *     return <>{isDebug && <DevOverlay />}</>;
 *   }
 */
export function useDebugMode(): boolean {
  const [active, setActive] = useState<boolean>(() => detectDebugMode());

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
      setActive(detail?.enabled ?? detectDebugMode());
    }
    window.addEventListener(DEBUG_CHANGE_EVENT, handler);
    return () => window.removeEventListener(DEBUG_CHANGE_EVENT, handler);
  }, []);

  return active;
}
// ---------------------------------------------------------------------------

type Listener = (event: DevEvent) => void;
const listeners = new Set<Listener>();

/** Push a new debug event — can be called from anywhere in the widget. */
export function pushDevEvent(event: Omit<DevEvent, 'id' | 'at'>): void {
  const full: DevEvent = {
    ...event,
    id: Math.random().toString(36).slice(2),
    at: Date.now(),
  };
  listeners.forEach((l) => {
    try {
      l(full);
    } catch {
      // ignore listener errors
    }
  });
}

function subscribeDevEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Live state channel (powers the "State" tab)
// ---------------------------------------------------------------------------

let currentDevState: DevState = {};
const stateListeners = new Set<(s: DevState) => void>();

/**
 * Merge a partial snapshot into the live widget state and notify the overlay.
 * Call from anywhere in the widget (e.g. EmbedClient) as values change:
 *
 *   reportDevState({ sessionId, handshake: 'CONNECTED', messageCount });
 */
export function reportDevState(partial: DevState): void {
  currentDevState = { ...currentDevState, ...partial };
  stateListeners.forEach((l) => {
    try {
      l(currentDevState);
    } catch {
      // ignore listener errors
    }
  });
}

/** Read the current state snapshot (used by console helpers / tests). */
export function getDevState(): DevState {
  return currentDevState;
}

function subscribeDevState(listener: (s: DevState) => void): () => void {
  stateListeners.add(listener);
  try {
    listener(currentDevState);
  } catch {
    // ignore
  }
  return () => {
    stateListeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Simulated offline mode
// ---------------------------------------------------------------------------
//
// Patches `window.fetch` inside the iframe so the widget's network calls fail
// as if offline — without DevTools "Offline" mode, which would block the whole
// host page. Also dispatches the browser online/offline events so the widget's
// connectivity listeners react exactly as they would for a real disconnect.

const OFFLINE_CHANGE_EVENT = 'companin:offline:change';

let _offlineMode = false;
let _originalFetch: typeof window.fetch | null = null;

/** Begin simulating an offline connection. Idempotent. */
export function simulateOffline(): void {
  if (typeof window === 'undefined' || _offlineMode) return;
  _originalFetch = window.fetch.bind(window);
  window.fetch = (() =>
    Promise.reject(new TypeError('Simulated offline (Widget DevOverlay)'))) as typeof window.fetch;
  _offlineMode = true;
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_CHANGE_EVENT, { detail: { offline: true } }));
    window.dispatchEvent(new Event('offline'));
  } catch {
    // ignore
  }
}

/** Restore the real connection (un-patch fetch). Idempotent. */
export function restoreOnline(): void {
  if (typeof window === 'undefined' || !_offlineMode) return;
  if (_originalFetch) window.fetch = _originalFetch;
  _offlineMode = false;
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_CHANGE_EVENT, { detail: { offline: false } }));
    window.dispatchEvent(new Event('online'));
  } catch {
    // ignore
  }
}

/** Whether the widget is currently in simulated-offline mode. */
export function isSimulatedOffline(): boolean {
  return _offlineMode;
}

// ---------------------------------------------------------------------------
// DevOverlay component
// ---------------------------------------------------------------------------

const MAX_EVENTS = 100;
const OVERLAY_KEY = 'widget_dev_overlay_pos';

type OverlayState = {
  events: DevEvent[];
  persisted: boolean;
};

type OverlayAction =
  | { type: 'push'; event: DevEvent }
  | { type: 'clear' }
  | { type: 'toggle-persist' };

function reducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case 'push': {
      const events = [...state.events, action.event].slice(-MAX_EVENTS);
      if (state.persisted) {
        try {
          sessionStorage.setItem(OVERLAY_KEY, JSON.stringify(events));
        } catch {
          // ignore
        }
      }
      return { ...state, events };
    }
    case 'clear':
      try {
        sessionStorage.removeItem(OVERLAY_KEY);
      } catch {
        // ignore
      }
      return { ...state, events: [] };
    case 'toggle-persist':
      return { ...state, persisted: !state.persisted };
    default:
      return state;
  }
}

function loadPersistedEvents(): DevEvent[] {
  try {
    const raw = sessionStorage.getItem(OVERLAY_KEY);
    return raw ? (JSON.parse(raw) as DevEvent[]) : [];
  } catch {
    return [];
  }
}

const COLORS: Record<DevEvent['kind'], string> = {
  'api-request': '#60a5fa',
  'api-response': '#34d399',
  event: '#a78bfa',
  error: '#f87171',
  render: '#fbbf24',
};

function fmt(n: number): string {
  return new Date(n).toLocaleTimeString('en-US', { hour12: false });
}

export function DevOverlay(): React.ReactElement | null {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<DevPanelTab>('events');
  const [state, dispatch] = useReducer(reducer, {
    events: loadPersistedEvents(),
    persisted: false,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const [devState, setDevState] = useState<DevState>(() => getDevState());
  const [simOffline, setSimOffline] = useState<boolean>(() => isSimulatedOffline());
  // Ticking clock so the auth-token countdown in the State tab updates live.
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  // Subscribe to global event bus
  useEffect(() => subscribeDevEvents((e) => dispatch({ type: 'push', event: e })), []);

  // Subscribe to the live state channel (State tab)
  useEffect(() => subscribeDevState(setDevState), []);

  // Track simulated-offline toggling (may be flipped from the console too)
  useEffect(() => {
    const handler = () => setSimOffline(isSimulatedOffline());
    window.addEventListener(OFFLINE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(OFFLINE_CHANGE_EVENT, handler);
  }, []);

  // Re-tick once a second while the State tab is open and a token expiry is known.
  useEffect(() => {
    if (!open || tab !== 'state' || !devState.authTokenExpiresAt) return;
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, tab, devState.authTokenExpiresAt]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [state.events.length]);

  const errors = state.events.filter((e) => e.kind === 'error');
  const timings = state.events.filter((e) => e.kind === 'render');

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 16,
    left: 16,
    zIndex: 99999,
    width: 380,
    maxHeight: open ? 420 : 36,
    overflow: 'hidden',
    background: 'rgba(15,15,20,0.95)',
    color: '#e2e8f0',
    fontFamily: 'monospace',
    fontSize: 11,
    borderRadius: 8,
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    transition: 'max-height 0.2s ease',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    background: 'rgba(30,30,40,0.95)',
    borderBottom: open ? '1px solid rgba(255,255,255,0.08)' : 'none',
    cursor: 'pointer',
    userSelect: 'none',
  };

  const tabsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 6,
    padding: '4px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '2px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    background: active ? 'rgba(99,102,241,0.4)' : 'transparent',
    color: active ? '#c7d2fe' : '#94a3b8',
    border: 'none',
    font: 'inherit',
    fontSize: 10,
  });

  const listStyle: React.CSSProperties = {
    height: 280,
    overflowY: 'auto',
    padding: '6px 0',
  };

  const footerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 10px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  };

  const btnStyle: React.CSSProperties = {
    padding: '2px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.08)',
    color: '#cbd5e1',
    border: 'none',
    font: 'inherit',
    fontSize: 10,
  };

  function renderEvent(ev: DevEvent) {
    return (
      <div
        key={ev.id}
        style={{
          padding: '3px 10px',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <span style={{ color: '#64748b', minWidth: 56 }}>{fmt(ev.at)}</span>
        <span
          style={{
            color: COLORS[ev.kind],
            minWidth: 80,
            fontSize: 10,
            fontWeight: 'bold',
          }}
        >
          {ev.kind}
        </span>
        <span style={{ color: '#cbd5e1', wordBreak: 'break-all' }}>{ev.label}</span>
      </div>
    );
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  // A single chronological stream of every event, annotated with the time
  // elapsed since the first event (+Nms) and the gap since the previous one,
  // with a collapsible payload. Easier to see "what happened in what order"
  // than flipping between the events/errors tabs.
  const timelineStart = state.events.length > 0 ? state.events[0].at : 0;

  function fmtDelta(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function renderTimelineEntry(ev: DevEvent, idx: number) {
    const sinceStart = ev.at - timelineStart;
    const sincePrev = idx > 0 ? ev.at - state.events[idx - 1].at : 0;
    return (
      <div
        key={ev.id}
        style={{
          padding: '4px 10px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: '#64748b', minWidth: 60 }}>+{fmtDelta(sinceStart)}</span>
          <span style={{ color: COLORS[ev.kind], minWidth: 80, fontSize: 10, fontWeight: 'bold' }}>
            {ev.kind}
          </span>
          <span style={{ color: '#cbd5e1', wordBreak: 'break-all', flex: 1 }}>{ev.label}</span>
          {sincePrev > 0 && (
            <span style={{ color: '#475569', fontSize: 9 }}>Δ{fmtDelta(sincePrev)}</span>
          )}
        </div>
        {typeof ev.data !== 'undefined' && ev.data !== null && (
          <details style={{ marginTop: 2, marginInlineStart: 68 }}>
            <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: 9 }}>payload</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '4px 0 0', color: '#94a3b8' }}>
              {safeStringify(ev.data)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  // ── State ───────────────────────────────────────────────────────────────
  const tokenSecondsLeft =
    typeof devState.authTokenExpiresAt === 'number'
      ? Math.max(0, Math.round((devState.authTokenExpiresAt - nowTs) / 1000))
      : null;

  function stateRow(label: string, value: React.ReactNode) {
    return (
      <div style={{ display: 'flex', gap: 8, padding: '3px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ color: '#64748b', minWidth: 120 }}>{label}</span>
        <span style={{ color: '#e2e8f0', wordBreak: 'break-all', flex: 1 }}>{value}</span>
      </div>
    );
  }

  function renderState() {
    return (
      <div>
        {stateRow('sessionId', devState.sessionId || <em style={{ color: '#475569' }}>none</em>)}
        {stateRow('clientId', devState.clientId || <em style={{ color: '#475569' }}>—</em>)}
        {stateRow('agentId', devState.agentId || <em style={{ color: '#475569' }}>—</em>)}
        {stateRow('configId', devState.configId || <em style={{ color: '#475569' }}>—</em>)}
        {stateRow('handshake', devState.handshake || <em style={{ color: '#475569' }}>unknown</em>)}
        {stateRow(
          'auth expires in',
          tokenSecondsLeft === null ? (
            <em style={{ color: '#475569' }}>unknown</em>
          ) : (
            <span style={{ color: tokenSecondsLeft < 60 ? '#f87171' : '#34d399' }}>{tokenSecondsLeft}s</span>
          )
        )}
        {stateRow('messages', String(devState.messageCount ?? 0))}
        {stateRow(
          'offline',
          <span style={{ color: devState.offline ? '#f87171' : '#34d399' }}>
            {devState.offline ? 'yes (browser)' : 'no'}
          </span>
        )}
        {stateRow(
          'simulated offline',
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: simOffline ? '#fbbf24' : '#94a3b8' }}>{simOffline ? 'ON' : 'off'}</span>
            <button
              style={btnStyle}
              onClick={() => (simOffline ? restoreOnline() : simulateOffline())}
            >
              {simOffline ? 'Go online' : 'Simulate offline'}
            </button>
          </span>
        )}
        {devState.config && (
          <details style={{ padding: '6px 10px' }}>
            <summary style={{ cursor: 'pointer', color: '#64748b' }}>config ({Object.keys(devState.config).length} keys)</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0 0', color: '#94a3b8' }}>
              {safeStringify(devState.config)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  const eventList = tab === 'errors' ? errors : tab === 'timings' ? timings : state.events;

  return (
    <div style={panelStyle} data-testid="dev-overlay">
      <div style={headerStyle} onClick={() => setOpen((v) => !v)}>
        <span style={{ color: '#818cf8', fontWeight: 'bold' }}>
          ⚙ Widget DevOverlay{simOffline ? ' · 📴' : ''}
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>
          {state.events.length} events {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <>
          <div style={tabsStyle}>
            {(['events', 'timeline', 'state', 'errors', 'timings'] as DevPanelTab[]).map((t) => (
              <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
                {t}
                {t === 'errors' && errors.length > 0 && (
                  <span style={{ color: '#f87171', marginLeft: 4 }}>
                    ({errors.length})
                  </span>
                )}
              </button>
            ))}
          </div>

          <div ref={listRef} style={listStyle}>
            {tab === 'state' ? (
              renderState()
            ) : tab === 'timeline' ? (
              state.events.length === 0 ? (
                <div style={{ padding: '12px 10px', color: '#475569' }}>No timeline yet.</div>
              ) : (
                state.events.map(renderTimelineEntry)
              )
            ) : eventList.length === 0 ? (
              <div style={{ padding: '12px 10px', color: '#475569' }}>No {tab} yet.</div>
            ) : (
              eventList.map(renderEvent)
            )}
          </div>

          <div style={footerStyle}>
            <button style={btnStyle} onClick={() => dispatch({ type: 'clear' })}>
              Clear
            </button>
            <button
              style={{
                ...btnStyle,
                background: state.persisted ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
              }}
              onClick={() => dispatch({ type: 'toggle-persist' })}
            >
              {state.persisted ? 'Persisting ✓' : 'Persist'}
            </button>
            <button
              style={{
                ...btnStyle,
                background: simOffline ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)',
              }}
              onClick={() => (simOffline ? restoreOnline() : simulateOffline())}
              title="Patch fetch() to simulate an offline connection"
            >
              {simOffline ? 'Offline ✓' : 'Offline'}
            </button>
            <button
              style={btnStyle}
              onClick={() => {
                const payload = {
                  capturedAt: new Date().toISOString(),
                  state: devState,
                  events: state.events,
                };
                try {
                  navigator.clipboard.writeText(safeStringify(payload))
                    .catch(() => {
                      // fallback: open in a new tab if clipboard is blocked
                      const w = window.open('', '_blank');
                      if (w) { w.document.body.innerText = safeStringify(payload); }
                    });
                } catch {
                  const w = window.open('', '_blank');
                  if (w) { w.document.body.innerText = safeStringify(payload); }
                }
              }}
              title="Copy all events + state as JSON for bug reports"
            >
              Copy
            </button>
            <span style={{ marginLeft: 'auto', color: '#475569' }}>
              {errors.length} err · {timings.length} renders
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** JSON.stringify that never throws (handles cycles / non-serializable values). */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

export default DevOverlay;
