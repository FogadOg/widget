/**
 * widget-app — public TypeScript types
 *
 * Import these in host applications:
 *   import type { WidgetConfig, MessageEvent, WidgetAPI, LogLevel, ErrorReport } from '@yourco/widget';
 *
 * All types defined here are re-exported from the package root (src/index.ts).
 */

// Re-export core domain types from the runtime module.
export type {
  WidgetConfig,
  Message,
  MessageData,
  SourceData,
  FlowButton,
  FlowResponse,
  Flow,
  ApiResponse,
  SessionData,
  PageContext,
  UnsureMessage,
} from './widget';

// Re-export typed validation errors (these are classes, not just types)
export { MissingFieldError, InvalidValueError } from '../lib/validateConfig';

// ---------------------------------------------------------------------------
// Additional public types required by the developer-experience plan
// ---------------------------------------------------------------------------

/** Logging severity levels understood by the widget logger. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structure of an error report sent by the widget to the monitoring backend
 * or Sentry.
 */
export type ErrorReport = {
  /** Human-readable error message. */
  message: string;
  /** Optional stack trace. */
  stack?: string;
  /** Severity level at time of capture. */
  level: LogLevel;
  /** ISO-8601 timestamp of when the error occurred. */
  timestamp: string;
  /** Browser user-agent string (may be absent in SSR contexts). */
  userAgent?: string;
  /** Page URL at time of error. */
  url?: string;
  /** Arbitrary additional metadata. */
  meta?: Record<string, unknown>;
};

/**
 * Event emitted by the widget when the user sends a message, the agent
 * responds, or the widget opens/closes.
 */
export type MessageEvent = {
  /** Unique event identifier. */
  id: string;
  /** Event type. */
  type: 'user-message' | 'agent-response' | 'open' | 'close' | 'auth-failure' | 'error';
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Event payload — shape depends on `type`. */
  data?: unknown;
};

/**
 * All known event names the widget emits.
 * Pass to `chat.on()` for type-safe subscriptions.
 */
export type WidgetEventName =
  // Lifecycle
  | 'widget.ready'
  | 'widget.opened'
  | 'widget.closed'
  | 'conversation.created'
  | 'conversation.closed'
  // Messaging
  | 'message.sent'
  | 'message.received'
  // User
  | 'user.updated'
  | 'file.uploaded'
  // Error / auth
  | 'error'
  | 'auth.failed'
  // Legacy flat names (still supported)
  | 'open'
  | 'close'
  | 'message'
  | 'response'
  | 'authFailure';

/**
 * Public API surface exposed on `window.CompaninWidget` (and the `window.chat`
 * convenience alias) after the widget script has loaded.
 *
 * Quick-start:
 *   const chat = window.CompaninWidget; // or window.chat
 *   await chat.init();          // idempotent — safe to call even if already ready
 *   chat.open();               // expand the chat panel
 *   chat.close();              // collapse the chat panel (launcher stays visible)
 *   chat.show();               // make the widget container visible
 *   chat.hide();               // hide the widget container entirely
 *   chat.toggle();             // open if closed, close if open
 *   chat.destroy();            // remove from DOM and unregister
 *   chat.reset();              // clear conversation and start a fresh session
 *   chat.identify({ userId, email, name, metadata });
 *   chat.prefill('How do I cancel?');
 *   chat.setContext({ page: '/checkout', cartTotal: 99 });
 *   chat.update({ primaryColor: '#ff0000' });
 *   chat.isOpen();             // → boolean
 *   chat.isVisible();          // → boolean
 *   chat.isReady();            // → boolean
 *   chat.on('widget.ready',            h)   // iframe bootstrapped
 *   chat.on('widget.opened',           h)   // panel expanded
 *   chat.on('widget.closed',           h)   // panel collapsed
 *   chat.on('conversation.created',    h)   // new session started
 *   chat.on('conversation.closed',     h)   // session reset/closed
 *   chat.on('message.sent',            h)   // user sent a message
 *   chat.on('message.received',        h)   // agent replied
 *   chat.on('user.updated',            h)   // identify() called
 *   chat.on('file.uploaded',           h)   // file uploaded (future)
 */
export interface WidgetAPI {
  // ── Core message / event API ──────────────────────────────────────────────

  /** Send an arbitrary payload to the widget chat. */
  sendMessage(payload: string | Record<string, unknown>): void;

  /**
   * Subscribe to a widget event. Returns an unsubscribe function.
   *
   * Known event names (any string is accepted for forward-compatibility):
   *   'widget.ready'           — iframe finished bootstrapping
   *   'widget.opened'          — chat panel expanded      (alias: 'open')
   *   'widget.closed'          — chat panel collapsed     (alias: 'close')
   *   'conversation.created'   — new session started
   *   'conversation.closed'    — session reset or ended
   *   'message.sent'           — user sent a message      (alias: 'message')
   *   'message.received'       — agent replied            (alias: 'response')
   *   'user.updated'           — identify() was called
   *   'file.uploaded'          — file upload completed (future)
   *   'auth.failed'            — authentication failed    (alias: 'authFailure')
   *   'error'                  — widget error
   */
  on(event: WidgetEventName | (string & {}), handler: (envelope: MessageEvent) => void): () => void;

  /** Unsubscribe a previously registered handler. */
  off(event: WidgetEventName | (string & {}), handler: (envelope: MessageEvent) => void): boolean;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Idempotent initialiser. Safe to call even when the widget has already
   * started (e.g. auto-init via the script tag).  Returns a Promise that
   * resolves with the API instance so callers can `await chat.init()`.
   *
   * Passing a `config` object forwards it to the iframe as a live update —
   * useful in SPAs where the config is known only after the script has run.
   */
  init(config?: Partial<WidgetConfig>): Promise<WidgetAPI>;

  /**
   * Show the widget container and tell the iframe to expand the chat panel.
   * Combines the effect of `show()` + a HOST_OPEN postMessage to the iframe.
   */
  open(): void;

  /**
   * Tell the iframe to collapse / minimize the chat panel.
   * The launcher button stays visible; call `hide()` to remove the container.
   */
  close(): void;

  /**
   * Make the widget container visible (CSS display:block).
   * Does not affect the open/closed state of the chat panel inside the iframe.
   */
  show(): void;

  /**
   * Hide the widget container entirely (CSS display:none).
   * Does not affect the open/closed state of the chat panel inside the iframe.
   */
  hide(): void;

  /**
   * Remove the widget from the DOM, unregister event listeners, and clear the
   * global `window.CompaninWidget` / `window.chat` references.
   * The instance is unusable after this call.
   */
  destroy(): void;

  /**
   * Clear the conversation history and start a fresh session.
   * Emits `conversation.closed` and resets host-side state.
   */
  reset(): void;

  /** Toggle the chat panel: open if collapsed, collapse if expanded. */
  toggle(): void;

  /** `true` if the chat panel is currently expanded (not the launcher button). */
  isOpen(): boolean;

  /** `true` if the widget container is currently visible (display:block). */
  isVisible(): boolean;

  /** `true` once the iframe has finished its bootstrap handshake. */
  isReady(): boolean;

  /**
   * Attach user identity to the session. Forwarded to the iframe and emits
   * a `user.updated` event so the host can react.
   */
  identify(user: {
    userId?: string;
    /** Alias for userId */
    id?: string;
    email?: string;
    name?: string;
    metadata?: Record<string, unknown>;
  }): void;

  /**
   * Pre-populate the chat input field. Call before `open()` so the user
   * can review and edit the text before sending.
   */
  prefill(text: string): void;

  /**
   * Push page-level context that the widget includes in its next API request.
   * Useful for sending cart state, page name, or any structured metadata.
   */
  setContext(data: Record<string, unknown>): void;

  /**
   * Live-update widget configuration without destroying and re-creating the
   * instance. Accepts a partial `WidgetConfig`.
   */
  update(config: Partial<WidgetConfig>): void;

  // ── Convenience / debug ───────────────────────────────────────────────────

  /** Resize the widget container to the given pixel dimensions. */
  resize(width: number, height: number): void;

  /** Grant storage consent (GDPR-strict mode). */
  grantConsent(): void;

  /** Revoke storage consent and purge widget localStorage entries. */
  revokeConsent(): void;

  /** Return the internal error buffer (useful for debugging). */
  getErrors(): Array<{ timestamp: string; message: string; context?: unknown }>;

  /** Enable runtime debug mode (shows DevOverlay). */
  enableDebug?(): void;

  /** Disable runtime debug mode. */
  disableDebug?(): void;

  // ── Legacy hook shortcuts (prefer `on()`) ─────────────────────────────────

  onOpen?(handler: (data: unknown) => void): () => void;
  onClose?(handler: (data: unknown) => void): () => void;
  onMessage?(handler: (data: unknown) => void): () => void;
  onResponse?(handler: (data: unknown) => void): () => void;
  onAuthFailure?(handler: (data: unknown) => void): () => void;
  onError?(handler: (data: unknown) => void): () => void;
  registerHooks?(hooks: {
    onOpen?: (data: unknown) => void;
    onClose?: (data: unknown) => void;
    onMessage?: (data: unknown) => void;
    onResponse?: (data: unknown) => void;
    onAuthFailure?: (data: unknown) => void;
    onError?: (data: unknown) => void;
  }): void;
}

/** Multi-instance manager available on `window.CompaninWidgets`. */
export interface WidgetRegistry {
  get(instanceId: string): WidgetAPI | null;
  list(): string[];
  destroy(instanceId: string): boolean;
}

declare global {
  interface Window {
    /** Primary widget API — always points to the most-recently initialised instance. */
    CompaninWidget: WidgetAPI | undefined;
    /** Convenience alias for `window.CompaninWidget`. */
    chat: WidgetAPI | undefined;
    /** Multi-instance registry. */
    CompaninWidgets: WidgetRegistry | undefined;
  }
}
