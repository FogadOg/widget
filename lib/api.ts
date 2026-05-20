/**
 * Centralized API utility for consistent API endpoint construction
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!BASE_URL) {
  console.warn('NEXT_PUBLIC_API_BASE_URL is not defined. API calls may fail.');
}

/**
 * Get the full API base URL
 */
export const getApiBaseUrl = (): string => {
  return BASE_URL || '';
};

/**
 * Get API v1 base URL
 */
export const getApiV1BaseUrl = (): string => {
  return `${getApiBaseUrl()}/api/v1`;
};

/**
 * Construct full API endpoint URLs
 */
export const API = {
  // Auth endpoints
  widgetToken: () => `${getApiV1BaseUrl()}/auth/widget-token`,

  // Session endpoints
  sessions: () => `${getApiV1BaseUrl()}/sessions/`,
  session: (sessionId: string) => `${getApiV1BaseUrl()}/sessions/${sessionId}`,
  sessionMessages: (sessionId?: string) => {
    if (!sessionId) {
      throw new Error('API.sessionMessages called with empty sessionId');
    }
    return `${getApiV1BaseUrl()}/sessions/${sessionId}/messages`;
  },
  sessionFeedback: (sessionId: string) => `${getApiV1BaseUrl()}/sessions/${sessionId}/feedback`,

  // Message endpoints
  messageFeedback: (messageId: string) => `${getApiV1BaseUrl()}/message/${messageId}/feedback`,

  // Assistant endpoints
  assistant: (assistantId: string) => `${getApiV1BaseUrl()}/assistants/${assistantId}`,

  // Config endpoints. Widget runtime now uses the read-only public projection
  // (LAUNCH-READINESS #17) so a widget_visitor JWT can load the config without
  // impersonating an admin user. The admin dashboard continues to call the
  // unsuffixed path for CRUD.
  widgetConfig: (configId: string, visitorId?: string, forceVariantId?: string) => {
    const base = `${getApiBaseUrl()}/widget-config/${configId}/public/`;
    const params = new URLSearchParams();
    if (visitorId) params.set('visitor_id', visitorId);
    if (forceVariantId) params.set('force_variant_id', forceVariantId);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  },
  widgetConfigVariants: (configId: string) => `${getApiBaseUrl()}/widget-config/${configId}/variants/`,
  widgetConfigVariant: (configId: string, variantId: string) => `${getApiBaseUrl()}/widget-config/${configId}/variants/${variantId}/`,
  supportTickets: () => `${getApiV1BaseUrl()}/support-tickets/`,
} as const;

/**
 * Check if API base URL is configured
 */
export const isApiConfigured = (): boolean => {
  return Boolean(BASE_URL && !BASE_URL.includes('undefined'));
};

// ---------------------------------------------------------------------------
// Telemetry helper moved here from separate module
// ---------------------------------------------------------------------------

interface TelemetryPayload {
  event_type: string;
  assistant?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Emit a telemetry event to the backend. Uses the same base URL as other
 * API calls and falls back to localhost if unset. This used to live in
 * lib/telemetry.ts but has been folded into api.ts as requested.
 */
export async function trackEvent(
  eventType: string,
  assistantId?: string,
  metadata: Record<string, unknown> = {},
  clientId?: string,
  authToken?: string
): Promise<void> {
  const BASE = getApiBaseUrl() || 'http://127.0.0.1:8000';
  const endpoint = `${BASE.replace(/\/+$/, '')}/telemetry/events/`;

  const payload: TelemetryPayload = { event_type: eventType };
  if (assistantId) payload.assistant = assistantId;
  if (metadata && Object.keys(metadata).length > 0) payload.metadata = metadata;

  try {
    // avoid importing the entire helpers module at top to keep dependencies
    const { getVisitorId } = await import('../app/embed/session/helpers');
    if (clientId) {
      payload.user_id = getVisitorId(clientId);
    }
  } catch {
    // ignore failures
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {

      console.warn('telemetry post failed', err);
    }
  }
}

/**
 * Returns the X-Embed-Origin header so the backend enforces the host app's
 * origin rather than the widget iframe's own origin.
 *
 * @param explicitOrigin - The parent page's origin passed in via URL param by
 *   widget.js (window.location.origin on the host page). When provided this is
 *   always used. Falls back to window.location.origin for non-iframe usage.
 */
export const embedOriginHeader = (explicitOrigin?: string): Record<string, string> => {
  if (explicitOrigin) {
    return { 'X-Embed-Origin': explicitOrigin };
  }

  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return { 'X-Embed-Origin': window.location.origin };
  }
  return {};
};

/**
 * Create a support ticket via the Ninja API
 */
export async function createSupportTicket(
  token: string,
  payload: {
    name: string;
    email: string;
    message: string;
    conversation_id?: string;
    session_id?: string;
  },
): Promise<{ id: string; created_at: string }> {
  const response = await fetch(API.supportTickets(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create ticket: ${response.status}`);
  const body = await response.json();
  return body.data as { id: string; created_at: string };
}
