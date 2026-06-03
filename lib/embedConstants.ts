// Centralized embed-related event names and storage key prefixes
// Centralized embed-related event names and storage key helpers
export const EMBED_EVENTS = {
  INIT_CONFIG: 'WIDGET_INIT_CONFIG',
  HOST_MESSAGE: 'HOST_MESSAGE',
  RESIZE: 'WIDGET_RESIZE',
  MINIMIZE: 'WIDGET_MINIMIZE',
  RESTORE: 'WIDGET_RESTORE',
  ERROR: 'WIDGET_ERROR',
  // Messages from iframe to host
  MESSAGE: 'WIDGET_MESSAGE',
  RESPONSE: 'WIDGET_RESPONSE',
  AUTH_FAILURE: 'WIDGET_AUTH_FAILURE',
  GA_INIT: 'WIDGET_GA_INIT',
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
