/**
 * Sandboxed iframe postMessage handshake protocol.
 *
 * When the widget is embedded in a `sandbox="allow-scripts"` iframe (without
 * `allow-same-origin`) it cannot read the parent's cookies or localStorage.
 * Communication with the host page happens exclusively via postMessage with:
 *
 *  1. Origin validation   – messages are rejected unless they come from a
 *                           known allowed origin.
 *  2. Schema validation   – every message is validated against a narrow type
 *                           union before being acted upon.
 *  3. Ephemeral token     – the iframe sends a READY message with a one-time
 *                           handshake token; the host echoes it back in INIT
 *                           to prove it holds the correct sequence.
 *
 * Usage (inside the iframe / widget):
 *   const hs = createHandshake({ allowedOrigins: ['https://example.com'] });
 *   hs.on('INIT', (payload) => { ... });
 *   hs.sendReady();
 *
 * Usage (on the host page):
 *   const hs = createHostHandshake({ widgetOrigin: 'https://widget.example.com' });
 *   hs.on('READY', ({ handshakeToken }) => { hs.sendInit(handshakeToken, config); });
 */

export type WidgetMessageType =
  | 'READY'
  | 'INIT'
  | 'RESIZE'
  | 'NAVIGATE'
  | 'AUTH_TOKEN'
  | 'PING'
  | 'PONG'
  | 'ERROR';

export interface BaseMessage {
  type: WidgetMessageType;
  /** Echoed back by both parties to tie request/response pairs. */
  handshakeToken?: string;
}

export interface ReadyMessage extends BaseMessage {
  type: 'READY';
  handshakeToken: string;
  version: string;
}

export interface InitMessage extends BaseMessage {
  type: 'INIT';
  handshakeToken: string;
  config: Record<string, unknown>;
}

export interface ResizeMessage extends BaseMessage {
  type: 'RESIZE';
  height: number;
}

export interface AuthTokenMessage extends BaseMessage {
  type: 'AUTH_TOKEN';
  token: string;
}

export interface PingMessage extends BaseMessage { type: 'PING' }
export interface PongMessage extends BaseMessage { type: 'PONG' }
export interface ErrorMessage extends BaseMessage { type: 'ERROR'; code: string; detail?: string }

export type WidgetMessage =
  | ReadyMessage
  | InitMessage
  | ResizeMessage
  | AuthTokenMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;

/**
 * Whether postMessage traffic should be logged to the console.
 *
 * The iframe↔host boundary is the hardest part of the widget to debug because
 * browser DevTools don't surface postMessage traffic. We log every message in
 * non-production builds, and in production only when the operator opts in via
 * `?widget_debug=1` or `localStorage.widget_debug = '1'` (mirrors
 * DevOverlay.detectDebugMode, but kept dependency-free so this module stays
 * lightweight). Reads are wrapped in try/catch for sandboxed contexts.
 */
function isHandshakeDebugActive(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    if (new URLSearchParams(window.location.search).get('widget_debug') === '1') return true;
  } catch {
    // ignore
  }
  try {
    if (localStorage.getItem('widget_debug') === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

/** Pretty-print a single postMessage in a collapsed console group. */
function logHandshakeMessage(direction: '→' | '←', data: unknown): void {
  if (!isHandshakeDebugActive()) return;
  try {
    const type = (data as { type?: unknown } | null)?.type ?? 'UNKNOWN';
    console.groupCollapsed(`[Widget postMessage] ${direction} ${String(type)}`);
    console.log(data);
    console.groupEnd();
  } catch {
    // never let logging break the handshake
  }
}

function generateToken(): string {
  const arr = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback for environments without a crypto implementation.
  // Use Math.random-based entropy as a last resort.
  let s = '';
  for (let i = 0; i < 24; i++) {
    s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return s;
}

function isValidMessage(data: unknown): data is WidgetMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d['type'] !== 'string') return false;
  const VALID_TYPES: WidgetMessageType[] = [
    'READY', 'INIT', 'RESIZE', 'NAVIGATE', 'AUTH_TOKEN', 'PING', 'PONG', 'ERROR',
  ];
  return VALID_TYPES.includes(d['type'] as WidgetMessageType);
}

type MessageHandler<T extends WidgetMessage = WidgetMessage> = (msg: T) => void;

/**
 * Widget-side handshake (runs inside the iframe).
 */
export function createHandshake(options: { allowedOrigins: string[] }) {
  const { allowedOrigins } = options;
  const listeners = new Map<WidgetMessageType, MessageHandler[]>();
  const handshakeToken = generateToken();

  function on<K extends WidgetMessage['type']>(
    type: K,
    handler: (msg: Extract<WidgetMessage, { type: K }>) => void
  ) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type)!.push(handler as MessageHandler);
  }

  function handleMessage(event: MessageEvent) {
    logHandshakeMessage('←', event.data);
    if (!allowedOrigins.includes(event.origin)) {
      console.warn('[handshake] Rejected message from origin:', event.origin);
      return;
    }
    if (!isValidMessage(event.data)) {
      console.warn('[handshake] Rejected invalid message schema');
      return;
    }
    const msg = event.data as WidgetMessage;
    const handlers = listeners.get(msg.type) ?? [];
    for (const h of handlers) h(msg);
  }

  function sendReady() {
    const msg: ReadyMessage = {
      type: 'READY',
      handshakeToken,
      version: process.env.NEXT_PUBLIC_WIDGET_VERSION ?? '1',
    };
    logHandshakeMessage('→', msg);
    window.parent.postMessage(msg, '*');
  }

  function sendResize(height: number) {
    const msg: ResizeMessage = { type: 'RESIZE', height };
    logHandshakeMessage('→', msg);
    window.parent.postMessage(msg, '*');
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
  }

  return { on, sendReady, sendResize, handshakeToken };
}

/**
 * Host-page handshake (runs on the integrator's page).
 */
export function createHostHandshake(options: {
  iframe: HTMLIFrameElement;
  widgetOrigin: string;
}) {
  const { iframe, widgetOrigin } = options;
  const listeners = new Map<WidgetMessageType, MessageHandler[]>();

  function on<K extends WidgetMessage['type']>(
    type: K,
    handler: (msg: Extract<WidgetMessage, { type: K }>) => void
  ) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type)!.push(handler as MessageHandler);
  }

  function handleMessage(event: MessageEvent) {
    if (event.origin !== widgetOrigin) return;
    if (!isValidMessage(event.data)) return;
    logHandshakeMessage('←', event.data);
    const msg = event.data as WidgetMessage;
    const handlers = listeners.get(msg.type) ?? [];
    for (const h of handlers) h(msg);
  }

  function sendInit(handshakeToken: string, config: Record<string, unknown>) {
    const msg: InitMessage = { type: 'INIT', handshakeToken, config };
    logHandshakeMessage('→', msg);
    iframe.contentWindow?.postMessage(msg, widgetOrigin);
  }

  window.addEventListener('message', handleMessage);

  return { on, sendInit };
}
