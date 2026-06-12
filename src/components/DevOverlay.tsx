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

export type DevPanelTab = 'events' | 'errors' | 'timings';

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
  if (process.env.NODE_ENV === 'production') return false;
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
  if (process.env.NODE_ENV === 'production') return;
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
  if (process.env.NODE_ENV === 'production') return;
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

  // Subscribe to global event bus
  useEffect(() => subscribeDevEvents((e) => dispatch({ type: 'push', event: e })), []);

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

  const visible = tab === 'events' ? state.events : tab === 'errors' ? errors : timings;

  return (
    <div style={panelStyle} data-testid="dev-overlay">
      <div style={headerStyle} onClick={() => setOpen((v) => !v)}>
        <span style={{ color: '#818cf8', fontWeight: 'bold' }}>
          ⚙ Widget DevOverlay
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>
          {state.events.length} events {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <>
          <div style={tabsStyle}>
            {(['events', 'errors', 'timings'] as DevPanelTab[]).map((t) => (
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
            {visible.length === 0 ? (
              <div style={{ padding: '12px 10px', color: '#475569' }}>No {tab} yet.</div>
            ) : (
              visible.map(renderEvent)
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
            <span style={{ marginLeft: 'auto', color: '#475569' }}>
              {errors.length} err · {timings.length} renders
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default DevOverlay;
