// Centralized embed-related event names and storage key prefixes
// Centralized embed-related event names and storage key helpers
export const EMBED_EVENTS = {
  // ── Host → iframe ────────────────────────────────────────────────────────
  INIT_CONFIG: 'WIDGET_INIT_CONFIG',
  HOST_MESSAGE: 'HOST_MESSAGE',

  // ── Iframe → host (layout / visibility) ──────────────────────────────────
  RESIZE: 'WIDGET_RESIZE',
  MINIMIZE: 'WIDGET_MINIMIZE',
  RESTORE: 'WIDGET_RESTORE',
  ERROR: 'WIDGET_ERROR',
  GA_INIT: 'WIDGET_GA_INIT',

  // ── Iframe → host (lifecycle) ─────────────────────────────────────────────
  /** Fired once when the iframe has finished bootstrapping. */
  READY: 'WIDGET_READY',
  /** Fired when a new conversation (session) is created. */
  CONVERSATION_CREATED: 'WIDGET_CONVERSATION_CREATED',
  /** Fired when the active conversation ends (explicit close or reset). */
  CONVERSATION_CLOSED: 'WIDGET_CONVERSATION_CLOSED',

  // ── Iframe → host (messaging) ─────────────────────────────────────────────
  /** A user message was sent (or an interaction button was pressed). */
  MESSAGE: 'WIDGET_MESSAGE',
  /** The agent sent a response. */
  RESPONSE: 'WIDGET_RESPONSE',
  AUTH_FAILURE: 'WIDGET_AUTH_FAILURE',

  // ── Iframe → host (user / files) ─────────────────────────────────────────
  /** User identity was updated via identify(). */
  USER_UPDATED: 'WIDGET_USER_UPDATED',
  /** A file was uploaded by the user (future). */
  FILE_UPLOADED: 'WIDGET_FILE_UPLOADED',

  // ── Message interceptors ──────────────────────────────────────────────────
  /** Iframe requests parent to run interceptors; parent replies with INTERCEPT_RESPONSE. */
  INTERCEPT_REQUEST: 'WIDGET_INTERCEPT_REQUEST',
  /** Parent sends intercepted (possibly modified) content back to the iframe. */
  INTERCEPT_RESPONSE: 'HOST_INTERCEPT_RESPONSE',
  /** Parent notifies iframe that at least one interceptor has been registered. */
  INTERCEPT_ACTIVE: 'HOST_INTERCEPT_ACTIVE',

  // ── Debug API ──────────────────────────────────────────────────────────────
  /** Host requests a diagnostics snapshot from the iframe. */
  DEBUG_ENABLE: 'WIDGET_DEBUG_ENABLE',
  DEBUG_DISABLE: 'WIDGET_DEBUG_DISABLE',
  /** Host requests a full diagnostics snapshot; iframe replies with DIAGNOSTICS_RESPONSE. */
  GET_DIAGNOSTICS: 'WIDGET_GET_DIAGNOSTICS',
  /** Iframe sends diagnostics snapshot back to the host. */
  DIAGNOSTICS_RESPONSE: 'WIDGET_DIAGNOSTICS_RESPONSE',
  /** Host asks the iframe to clear all widget-prefixed localStorage keys. */
  CLEAR_SESSION: 'WIDGET_CLEAR_SESSION',
  /** Iframe confirms session was cleared with a count of removed keys. */
  CLEAR_SESSION_RESPONSE: 'WIDGET_CLEAR_SESSION_RESPONSE',
  /** Host asks the iframe to simulate an offline connection. */
  SIMULATE_OFFLINE: 'WIDGET_SIMULATE_OFFLINE',
  /** Host asks the iframe to restore the real network connection. */
  RESTORE_ONLINE: 'WIDGET_RESTORE_ONLINE',
  /** Host changes the logger's minimum log level inside the iframe. */
  SET_LOG_LEVEL: 'WIDGET_SET_LOG_LEVEL',
} as const;
import { STORAGE_PREFIX } from "./constants";

export const STORAGE_KEYS = {
  sessionPrefix: (clientId: string, agentId: string) => `${STORAGE_PREFIX}session-${clientId}-${agentId}`,
  unreadPrefix: (clientId: string, agentId: string) => `${STORAGE_PREFIX}unread-${clientId}-${agentId}`,
  lastReadPrefix: (clientId: string, agentId: string) => `${STORAGE_PREFIX}lastread-${clientId}-${agentId}`,
  visitorPrefix: (clientId: string) => `${STORAGE_PREFIX}visitor-${clientId}`,
  feedbackKey: (sessionId: string) => `${STORAGE_PREFIX}feedback-${sessionId}`,
};

/**
 * Resolve the postMessage target origin (LAUNCH-READINESS.md #6).
 *
 * Returns the explicit origin when provided. Falls back to `null` in production
 * so callers explicitly suppress messages with no known recipient rather than
 * broadcasting to any framing site with `'*'`. In dev/test we keep the `'*'`
 * fallback so iframe-based test harnesses (jsdom, Playwright) still receive
 * the events they assert on.
 *
 * NOTE: returning null means the caller should guard the call:
 *   const target = targetOrigin(parentOrigin);
 *   if (target) window.parent.postMessage(msg, target);
 */
export const targetOrigin = (explicit?: string): string | null => {
  if (explicit) return explicit;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    return '*';
  }
  return null;
};

/**
 * Like targetOrigin but for sensitive messages (auth, chat content).
 * Always refuses to broadcast — returns null when no explicit origin is
 * available so callers suppress the send rather than leaking to any origin.
 */
export const sensitiveOrigin = (explicit?: string): string | null => explicit || null;
