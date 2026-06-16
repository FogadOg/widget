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

// Widget sizing
export const BUTTON_SIZES = {
  sm: 48,
  md: 56,
  lg: 64,
} as const;

// Shadow intensity map
export const SHADOW_INTENSITY = {
  none: 'none',
  sm: '0 1px 2px 0',
  md: '0 4px 6px -1px',
  lg: '0 10px 15px -3px',
  xl: '0 20px 25px -5px',
} as const;

// Default colors
export const DEFAULT_COLORS = {
  PRIMARY: '#111827',
  SECONDARY: '#374151',
  BACKGROUND: '#ffffff',
  TEXT: '#1f2937',
  SHADOW: '#000000',
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
  FONT_SIZE: 14,
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
  'en', 'de', 'es', 'fr', 'pt', 'sv', 'nl', 'nb', 'it', 'pl'
] as const;

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
