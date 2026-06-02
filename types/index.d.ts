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
 * Public API surface exposed on `window.CompaninWidget` after the widget
 * script has loaded.
 */
export interface WidgetAPI {
  /** Send an arbitrary payload to the widget. */
  sendMessage(payload: string | Record<string, unknown>): void;
  /** Subscribe to a named event; returns an unsubscribe function. */
  on(event: string, handler: (envelope: MessageEvent) => void): () => void;
  /** Open the widget chat panel. */
  open?(): void;
  /** Close the widget chat panel. */
  close?(): void;
  /** Toggle the widget open/closed state. */
  toggle?(): void;
  /** Enable runtime debug mode (shows DevOverlay). */
  enableDebug?(): void;
  /** Disable runtime debug mode. */
  disableDebug?(): void;
}
