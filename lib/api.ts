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
 * Server-side (Node) API base URL. The browser-facing NEXT_PUBLIC_API_BASE_URL
 * (e.g. http://localhost:8000) is NOT reachable from inside a container — there
 * `localhost` is the widget itself, not the backend. For server-side fetches
 * (e.g. resolving the install key in the embed page) prefer INTERNAL_API_BASE_URL
 * (e.g. http://backend:8000), falling back to the public URL — which is correct
 * in production, where it's a real public host reachable from the server too.
 */
export const getServerApiBaseUrl = (): string => {
  return process.env.INTERNAL_API_BASE_URL || getApiBaseUrl();
};

export const getServerApiV1BaseUrl = (): string => {
  return `${getServerApiBaseUrl()}/api/v1`;
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
  sessionHeartbeat: (sessionId: string) => `${getApiV1BaseUrl()}/sessions/${sessionId}/heartbeat`,

  // Message endpoints
  messageFeedback: (messageId: string) => `${getApiV1BaseUrl()}/message/${messageId}/feedback`,

  // Agent endpoints
  agent: (agentId: string) => `${getApiV1BaseUrl()}/agents/${agentId}`,

  // Single-key resolver: maps a public install key (wgt_…) to the embed triple.
  // `embedResolve` is browser-facing; `embedResolveServer` is for server-side
  // calls (embed page) that must reach the backend via the internal host.
  embedResolve: (key: string) => `${getApiV1BaseUrl()}/embed/resolve?key=${encodeURIComponent(key)}`,
  embedResolveServer: (key: string) => `${getServerApiV1BaseUrl()}/embed/resolve?key=${encodeURIComponent(key)}`,

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

  // Logged-in user session lookup — returns the most recent active session
  // for the external_user_id embedded in the visitor JWT.
  sessionByUser: () => `${getApiV1BaseUrl()}/auth/sessions/by-user`,

  // Docs widget instant knowledge search — callable with a widget_visitor JWT.
  widgetKnowledgeSearch: (agentId: string, q: string, limit = 8) => {
    const params = new URLSearchParams({ agent_id: agentId, q, limit: String(limit) });
    return `${getApiV1BaseUrl()}/knowledge/search/widget?${params}`;
  },
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
  agent?: string;
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
  agentId?: string,
  metadata: Record<string, unknown> = {},
  clientId?: string,
  authToken?: string,
  embedHeaders?: Record<string, string>
): Promise<void> {
  const BASE = getApiBaseUrl();
  if (!BASE) {
    return;
  }
  const endpoint = `${BASE.replace(/\/+$/, '')}/telemetry/events/`;

  const payload: TelemetryPayload = { event_type: eventType };
  if (agentId) payload.agent = agentId;
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
    if (embedHeaders) {
      Object.assign(headers, embedHeaders);
    }
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
export const embedOriginHeader = (explicitOrigin?: string, loaderVersion?: string): Record<string, string> => {
  const headers: Record<string, string> = {};

  if (explicitOrigin) {
    headers['X-Embed-Origin'] = explicitOrigin;
  } else if (typeof window !== 'undefined' && window.location && window.location.origin) {
    headers['X-Embed-Origin'] = window.location.origin;
  }

  if (loaderVersion) {
    headers['X-Widget-Loader-Version'] = loaderVersion;
  }

  return headers;
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
  embedHeaders?: Record<string, string>,
): Promise<{ id: string; created_at: string }> {
  const response = await fetch(API.supportTickets(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(embedHeaders ?? {}),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create ticket: ${response.status}`);
  const body = await response.json();
  return body.data as { id: string; created_at: string };
}
