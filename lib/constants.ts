export const BRAND_NAME = "Customer Support AI Agent";
export const COMPANY_NAME = "Companin";

// Non-localizable identifiers / prefixes used across the widget
export const STORAGE_PREFIX = "companin-";
export const WIDGET_SCRIPT_ID = "companin-widget";
export const DOCS_WIDGET_SCRIPT_ID = "companin-docs-widget";

const WIDGET_CONSTANTS = {
  BRAND_NAME,
  COMPANY_NAME,
  STORAGE_PREFIX,
  WIDGET_SCRIPT_ID,
  DOCS_WIDGET_SCRIPT_ID,
};

export default WIDGET_CONSTANTS;
// Widget Constants

// Timeout values (in milliseconds)
export const TIMEOUTS = {
  AUTH_REQUEST: 10000,           // 10 seconds
  SESSION_CREATE: 15000,         // 15 seconds
  MESSAGE_SEND: 30000,           // 30 seconds
  // Bounds the *streaming* phase, which MESSAGE_SEND does not: that timer is
  // cleared once response headers arrive, and the server flushes headers
  // immediately, so without this a stream that goes quiet mid-answer left the
  // reader pending forever. This fires only on silence — every chunk, including
  // the server's SSE heartbeat comments, pushes it back — so it must simply be
  // longer than the heartbeat interval, not longer than a whole answer.
  STREAM_STALL: 45000,           // 45 seconds with no bytes at all
  WIDGET_LOAD: 15000,            // 15 seconds
  FEEDBACK_INACTIVITY: 30000,    // 30 seconds
  SESSION_EXPIRY_CHECK: 60000,   // 60 seconds
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,           // 1 second
  MAX_DELAY: 10000,              // 10 seconds
  BACKOFF_MULTIPLIER: 2,
} as const;

// Session configuration
export const SESSION_CONFIG = {
  EXPIRY_BUFFER: 5 * 60 * 1000,  // 5 minutes buffer before expiry
} as const;

// Presence heartbeat: how often the widget pings the backend while its tab is
// visible, driving the admin "live visitors" count. Keep the backend's
// LIVE_VISITOR_WINDOW_SECONDS >= 2x this so a single dropped beat doesn't blink
// a visitor off the count.
export const HEARTBEAT_INTERVAL_MS = 20_000;

// Widget sizing
export const BUTTON_SIZES = {
  sm: 48,
  md: 56,
  lg: 64,
} as const;

// Shadow intensity map
// Drop-shadow levels for the floating panel, tinted with `shadow_color`.
// `md` is the default and matches the shadow every shell hard-coded until the
// setting was wired up (rgba(0,0,0,0.2) 0 10px 40px), so `md` widgets look the
// same. Widgets saved with sm/lg/xl/none — including those built from the
// templates and presets that use them — rendered as `md` while the setting was
// dead, and change to their chosen level from 0.1.7 onwards.
export const SHADOW_INTENSITY = {
  none: null,
  sm: { y: 4, blur: 16, alpha: 0.12 },
  md: { y: 10, blur: 40, alpha: 0.2 },
  lg: { y: 16, blur: 56, alpha: 0.26 },
  xl: { y: 24, blur: 72, alpha: 0.32 },
} as const;

// Default colors
export const DEFAULT_COLORS = {
  PRIMARY: '#111827',
  SECONDARY: '#374151',
  BACKGROUND: '#ffffff',
  TEXT: '#1f2937',
  SHADOW: '#000000',
} as const;

// Dark-theme surface + text. Substituted for a light-looking background/text
// when the resolved theme is dark (see useWidgetStyles). The widget derives all
// neutrals (muted text, borders, skeletons, agent-bubble surface) from these,
// so swapping the two here is enough to produce a coherent dark widget.
export const DARK_DEFAULTS = {
  BACKGROUND: '#0f172a',
  TEXT: '#e2e8f0',
} as const;

// Semantic status colors — the one place color carries *meaning* in the widget
// (error / offline / warning), kept theme-independent on purpose so a critical
// message reads the same on every brand. Mirrors the values previously inlined
// across EmbedShell/MessageBubble so centralizing them is a no-visual-change move.
export const STATUS_COLORS = {
  error:   { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c' },
  offline: { bg: '#f0f9ff', border: '#7dd3fc', text: '#0c4a6e' },
  warning: { bg: '#fef3c7', border: '#fcd34d', text: '#78350f' },
  safety:  { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
  danger:  '#ef4444',
} as const;

// Default values
export const DEFAULTS = {
  BORDER_RADIUS: 8,
  FONT_FAMILY: 'Inter',
  // Message body. 14 gave the panel only TWO rendered sizes — 14 for everything
  // `fontStyles` touched and 12 for the `text-xs` metadata — so the agent's
  // answer, the header subtitle and the quick replies all carried identical
  // weight. 16 restores a hierarchy (16 body / 14 controls / 12 meta) and
  // matches what comparable chat widgets use for a message.
  // Only affects widgets that never set `font_size`; an explicit value wins.
  FONT_SIZE: 16,
  FONT_WEIGHT: 'normal',
  SHADOW_INTENSITY: 'md',
  WIDGET_WIDTH: 400,
  WIDGET_HEIGHT: 600,
  WIDGET_SIZE: 'md',
  BUTTON_SIZE: 'md',
  OPACITY: 1.0,
  LOCALE: 'en',
  POSITION: 'bottom-right',
  EDGE_OFFSET: 20,
} as const;

// Size presets map to concrete pixel dimensions used by the embed runtime.
export const SIZE_PRESETS: Record<string, { w: number; h: number }> = {
  sm: { w: 300, h: 500 },
  md: { w: 350, h: 600 },
  lg: { w: 420, h: 700 },
};

// Supported locales
export const SUPPORTED_LOCALES = [
  'en', 'de', 'es', 'fr', 'pt', 'sv', 'nl', 'nb', 'it', 'pl', 'tr', 'id', 'ko', 'ru'
] as const;

/**
 * Rich-block schema version this build renders. Mirrors
 * `BLOCK_SCHEMA_VERSION` in `core/services/rich_blocks.py`. Content stamped
 * with any other version renders as nothing, so an older widget never
 * half-renders a newer schema.
 */
export const RICH_BLOCK_SCHEMA_VERSION = 1;

/** Minimum width of a carousel item, in px — also the scroll step. */
export const RICH_CARD_MIN_WIDTH = 208;

// Input validation
export const INPUT_LIMITS = {
  MAX_MESSAGE_LENGTH: 4000,
  MIN_MESSAGE_LENGTH: 1,
} as const;

// Client-side rate limiting for message sends
export const RATE_LIMIT = {
  MAX_MESSAGES: 5,      // max messages allowed
  WINDOW_MS: 10_000,    // time window in milliseconds
} as const;
// API endpoints
export const API_ENDPOINTS = {
  AUTH_TOKEN: '/auth/widget-token',
  SESSIONS: '/sessions',
  AGENTS: '/agents',
  WIDGET_CONFIG: '/widget-config',
  MESSAGES: (sessionId: string) => `/sessions/${sessionId}/messages`,
  FEEDBACK: (sessionId: string) => `/sessions/${sessionId}/feedback`,
  MESSAGE_FEEDBACK: (messageId: string) => `/message/${messageId}/feedback`,
} as const;
