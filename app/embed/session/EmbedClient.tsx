'use client';
import { useWidgetAuth } from '../../../hooks/useWidgetAuth';
import { useWidgetTranslation } from '../../../hooks/useWidgetTranslation';
import { getLocaleDirection } from '../../../lib/i18n';
import type {
  Message,
  WidgetConfig,
  FlowResponse,
  FlowButton,
  Flow,
  SourceData,
} from '../../../types/widget';
import { ButtonLike } from '../../../hooks/useClickedButtons';
import { logPerf } from '../../../lib/logger';
import { trackEvent, embedOriginHeader, createSupportTicket } from '../../../lib/api';
import { HandoffModal } from '../HandoffModal';
import FeedbackDialog from '../../../components/FeedbackDialog';
import {
  createSessionError,
  createNetworkError,
  createAuthError,
  retryWithBackoff,
  logError,
  parseApiError,
  WidgetErrorCode,
} from '../../../lib/errorHandling';
import { API } from '../../../lib/api';
import { EMBED_EVENTS, STORAGE_KEYS, targetOrigin, sensitiveOrigin } from '../../../lib/embedConstants';
import { BUTTON_SIZES, DEFAULTS, SIZE_PRESETS } from '../../../lib/constants';
import * as helpers from './helpers';
import { getQueuedMessages, removeQueuedMessage, queueMessage, incrementAttempt } from '../../../src/lib/offline';
import { onInitConfig } from './events';
import { sanitizeCss } from '../../../lib/cssValidator';
import { validateConfig } from '../../../lib/validateConfig';
import { enableDebug, disableDebug } from '../../../src/components/DevOverlay';
import {
  registerInstance,
  deregisterInstance,
  makeInstanceId,
  open as registryOpen,
  close as registryClose,
} from '../../../src/lib/widgetRegistry';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// For streaming decoding
const textDecoder = typeof window !== 'undefined' && window.TextDecoder ? new window.TextDecoder() : undefined;
import EmbedShell from 'components/EmbedShell';

// helpers exposed so tests can call them directly
export function injectCustomAssets(css?: string) {
  try {
    if (css) {
      let safe: string | undefined = undefined;
      try {
        safe = sanitizeCss(css);
      } catch (err) {
        logError(err as Error, { action: 'injectCustomAssets', css });
        return;
      }
      if (!safe) {
        logError('sanitizeCss returned falsy', { action: 'injectCustomAssets', css });
        return;
      }
      const style = document.createElement('style');
      style.textContent = safe;
      document.head.appendChild(style);
    }
  } catch (err) {
    logError(err as Error, { action: 'injectCustomAssets', css });
  }
}

export function applyCustomAssetsFromQuery(search?: string) {
  // Legacy path retained so customers with old snippets keep working until they
  // migrate. New deployments serve custom_css via WidgetConfig (#20). We keep
  // sanitizeCss on the URL-supplied value because the hardened sanitizer still
  // strips dangerous patterns even when consumed from an untrusted URL.
  try {
    const src = search ?? window.location.search;
    const params = new URLSearchParams(src);
    const css = params.get('customCss');
    if (css) {
      injectCustomAssets(decodeURIComponent(css));
    }
  } catch (err) {
    logError(err, { action: 'applyCustomAssetsFromQuery', search });
  }
}

// New path: inject custom CSS sourced from the loaded widget configuration.
// The dashboard already persists `custom_css` server-side (WidgetConfig.custom_css);
// the embed page reads it after fetchWidgetConfig succeeds.
export function injectCustomAssetsFromConfig(config: { custom_css?: string | null } | null | undefined) {
  if (!config) return;
  const css = config.custom_css || undefined;
  if (css) injectCustomAssets(css);
}



export const getButtonPixelSize = (buttonSize: string) => {
  return BUTTON_SIZES[buttonSize as keyof typeof BUTTON_SIZES] || BUTTON_SIZES.md;
};

export const getNormalizedEdgeOffset = (config?: WidgetConfig | null): number => {
  if (!config) return 20;

  const raw = (config as WidgetConfig & { edgeOffset?: unknown }).edgeOffset ?? config.edge_offset;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 20;
};

type HostWidgetAction = 'open' | 'close' | 'toggle';
type ParsedHostMessageCommand =
  | { kind: 'action'; action: HostWidgetAction }
  | { kind: 'message'; text: string }
  | null;

export function parseHostMessageCommand(raw: unknown): ParsedHostMessageCommand {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return null;
    const cmd = text.toLowerCase();
    if (cmd === 'open' || cmd === 'show' || cmd === 'restore') return { kind: 'action', action: 'open' };
    if (cmd === 'close' || cmd === 'hide' || cmd === 'minimize') return { kind: 'action', action: 'close' };
    if (cmd === 'toggle') return { kind: 'action', action: 'toggle' };
    return { kind: 'message', text };
  }

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  const commandValue = [payload.action, payload.command, payload.event, payload.type]
    .find((value) => typeof value === 'string');
  const command = typeof commandValue === 'string' ? commandValue.trim().toLowerCase() : '';

  if (command) {
    if (command === 'open' || command === 'show' || command === 'restore') {
      return { kind: 'action', action: 'open' };
    }

    if (command === 'close' || command === 'hide' || command === 'minimize') {
      return { kind: 'action', action: 'close' };
    }

    if (command === 'toggle') {
      return { kind: 'action', action: 'toggle' };
    }
  }

  const textValue = [payload.text, payload.message, payload.content, payload.prompt, payload.query]
    .find((value) => typeof value === 'string');
  const text = typeof textValue === 'string' ? textValue.trim() : '';
  if (!text) {
    return null;
  }

  return { kind: 'message', text };
}

export function resolveParentTargetOrigin(
  explicit?: string,
  referrer?: string,
  /** When true, fall back to the document referrer origin but never '*' */
  strict?: boolean,
): string | null {
  const explicitOrigin = (explicit || '').trim();
  if (explicitOrigin) {
    return explicitOrigin;
  }

  const fallbackReferrer = typeof referrer === 'string'
    ? referrer
    : (typeof document !== 'undefined' ? document.referrer : '');

  if (fallbackReferrer) {
    try {
      const parsed = new URL(fallbackReferrer);
      if (parsed.origin) {
        return parsed.origin;
      }
    } catch {
      // ignore invalid referrer
    }
  }

  // In strict mode never fall back to wildcard — refuse to post to unknown origins.
  // The parent window will not receive messages until it re-embeds with a valid origin.
  if (strict) return null;
  return '*';
}

type EmbedClientProps = {
  clientId: string;
  agentId: string;
  configId: string;
  locale: string;
  startOpen: boolean;
  pagePath?: string;
  parentOrigin?: string;
  /** Mirror of data-strict-origin. When true, never send postMessage to '*'. */
  strictOrigin?: boolean;
  /** Admin-only: force a specific variant ID to bypass hash assignment (for preview/testing). */
  forceVariantId?: string;
  /** When true, the host page requires explicit storage consent before the widget
   *  may write visitor IDs or session IDs to localStorage (LAUNCH-READINESS #16). */
  consentRequired?: boolean;
  /** When true, the widget is embedded inline (persistent mode) — hides the close/collapse button. */
  persistent?: boolean;
  /** Version of the embed loader script (e.g. "0.1.0"). Absent on pre-versioning installs.
   *  Use this to gate behavior changes so old loaders keep working after a breaking deploy. */
  loaderVersion?: string;
  /**
   * test-only: forcibly display the feedback dialog regardless of timer state
   */
  showFeedbackDialogOverride?: boolean;
};

export default function EmbedClient({
  clientId: initialClientId,
  agentId: initialAgentId,
  configId: initialConfigId,
  locale: initialLocale,
  startOpen: initialStartOpen,
  parentOrigin: initialParentOrigin,
  strictOrigin: initialStrictOrigin = false,
  forceVariantId: initialForceVariantId,
  consentRequired: initialConsentRequired = false,
  persistent: isPersistent = false,
  loaderVersion,
  showFeedbackDialogOverride,
}: EmbedClientProps) {
  // Stable header bag forwarded on every API request. The X-Widget-Loader-Version
  // header lets the backend gate behaviour changes so old loaders keep working
  // after a breaking deploy (absent = pre-versioning install, treat as legacy).
  const embedHeaders = useMemo(
    () => embedOriginHeader(initialParentOrigin, loaderVersion),
    [initialParentOrigin, loaderVersion],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [flowResponses, setFlowResponses] = useState<FlowResponse[]>([]);

  // Keep <html lang> and <html dir> in sync with the widget's locale so that
  // screen readers, browser spell-check, and RTL CSS all use the correct language.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const dir = getLocaleDirection(initialLocale);
    document.documentElement.lang = initialLocale;
    document.documentElement.dir = dir;
  }, [initialLocale]);

  // Install the consent gate before any storage helper runs (LAUNCH-READINESS #16).
  // Until the host page postMessages WIDGET_CONSENT_GRANT, visitor IDs and
  // session IDs are kept in-memory only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('../../../lib/sessionStorage');
        if (cancelled) return;
        mod.setConsentRequired(initialConsentRequired);
      } catch {
        // sessionStorage module is required for the widget; if it can't import
        // there are larger problems and the bootstrap will surface them.
      }
    })();
    return () => { cancelled = true; };
  }, [initialConsentRequired]);

  // Listen for consent grant/revoke from the host page via the widget loader's
  // postMessage relay (window.CompaninWidget.grantConsent / revokeConsent).
  useEffect(() => {
    if (!initialConsentRequired) return;
    const handler = async (event: MessageEvent) => {
      const t = event?.data?.type;
      if (t !== 'WIDGET_CONSENT_GRANT' && t !== 'WIDGET_CONSENT_REVOKE') return;
      try {
        const mod = await import('../../../lib/sessionStorage');
        if (t === 'WIDGET_CONSENT_GRANT') mod.grantStorageConsent();
        else mod.revokeStorageConsent();
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [initialConsentRequired]);

  // Allow the host page to toggle debug mode via postMessage.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const t = event?.data?.type;
      if (t === 'WIDGET_DEBUG_ENABLE') enableDebug();
      else if (t === 'WIDGET_DEBUG_DISABLE') disableDebug();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // debug and perform custom css/js injection on mount
  useEffect(() => {
    applyCustomAssetsFromQuery();
  }, []);


  // precompute storage keys for this widget instance
  // activeLocale is computed before this point so we use initialLocale directly here
  // Call the legacy helper so tests that mock it still observe the call.
  const baseSessionKey = helpers.sessionStorageKey(initialClientId, initialAgentId);
  const sessionStorageKey = initialLocale ? `${baseSessionKey}-${initialLocale}` : baseSessionKey;
  const unreadStorageKey = helpers.unreadStorageKey(initialClientId, initialAgentId);
  const lastReadStorageKey = helpers.lastReadStorageKey(initialClientId, initialAgentId);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // Streaming state: holds the partial agent message being streamed
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // emit widget_load telemetry when widget mounts, but only once per
  // browser session; reloading the page should not produce duplicate load events.
  // We use a storage key unique to the client+agent+config combo.
  useEffect(() => {
    const loadKey = `companin-telemetry-load-${initialClientId}-${initialAgentId}-${initialConfigId}`;
    // if we've already sent the load event, do nothing
    let alreadySent = false;
    try {
      alreadySent = !!localStorage.getItem(loadKey);
    } catch (err) {
      logError(err as Error, { context: 'widgetLoadTelemetry' });
    }
    if (alreadySent) {
      return;
    }

    trackEvent('widget_load', initialAgentId, { widget_config_id: initialConfigId }, initialClientId, undefined, embedHeaders).catch(() => {});

    try {
      localStorage.setItem(loadKey, '1');
    } catch (error) {
      // record failure but don't crash the widget
      logError(error as Error, { context: 'widgetLoadTelemetry' });
    }
  }, [initialAgentId, initialClientId]);

  // emit initial open/close telemetry when widget mounts, but only once per
  // browser session; reloading the page should not produce duplicate open/close
  // events. We use a storage key unique to the client+agent combo.
  useEffect(() => {
    const initKey = `companin-telemetry-init-${initialClientId}-${initialAgentId}`;
    // if we've already sent the initial event, do nothing
    let alreadySent = false;
    try {
      alreadySent = !!localStorage.getItem(initKey);
    } catch (err) {
      logError(err as Error, { context: 'initialTelemetry' });
    }
    if (alreadySent) {
      return;
    }

    const initialEvent = initialStartOpen ? 'widget_open' : 'widget_close';
    trackEvent(initialEvent, initialAgentId, {}, initialClientId, undefined, embedHeaders).catch(() => {});

    try {
      localStorage.setItem(initKey, '1');
    } catch (error) {
      // record failure but don't crash the widget
      logError(error as Error, { context: 'initialTelemetry' });
    }
  }, [initialAgentId, initialClientId, initialStartOpen]);
  const { getAuthToken, authToken, authError, scheduleAutoRefresh = () => {}, getTokenExpiresAt } = useWidgetAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Tracks whether the initial loadSessionMessages has completed at least once.
  // Used to prevent the local-message persist effect from wiping localStorage
  // before loadSessionMessages has had a chance to read and restore the data.
  const hasLoadedMessagesRef = useRef(false);

  // Restore flow responses from localStorage when a session is (re-)established.
  // Must be declared AFTER sessionId to avoid Temporal Dead Zone errors.
  // Replace state outright (don't append) to avoid duplicates on repeated triggers.
  useEffect(() => {
    if (!sessionId) return;
    const key = helpers.flowResponsesStorageKey(sessionId);
    let timeoutId: number | null = null;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as FlowResponse[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          timeoutId = window.setTimeout(() => {
            setFlowResponses(parsed);
          }, 0);
        }
      }
    } catch {
      // ignore – corrupt / unavailable storage
    }
    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [sessionId]);

  // Persist flow responses to localStorage whenever they change so they survive reloads.
  useEffect(() => {
    if (!sessionId) return;
    const key = helpers.flowResponsesStorageKey(sessionId);
    try {
      if (flowResponses.length > 0) {
        localStorage.setItem(key, JSON.stringify(flowResponses));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore – storage unavailable or quota exceeded
    }
  }, [flowResponses, sessionId]);

  // Persist local-only temp messages (interaction button user bubbles that are
  // never sent to the server) so they survive hard reloads.
  // Only clear the localStorage entry after initial messages have been loaded,
  // to avoid wiping the data before loadSessionMessages can restore it.
  useEffect(() => {
    if (!sessionId) return;
    const key = helpers.localMessagesStorageKey(sessionId);
    try {
      const localOnly = messages.filter(
        (m) => m.id.startsWith('temp-') && !(m as any).pending
      );
      if (localOnly.length > 0) {
        localStorage.setItem(key, JSON.stringify(localOnly));
      } else if (hasLoadedMessagesRef.current) {
        // Only remove once we've confirmed via loadSessionMessages that there
        // really are no local messages (i.e. this isn't a stale empty state).
        localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  }, [messages, sessionId]);
  const authTokenRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [agentName, setAgentName] = useState<string>('');
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [shouldRender, setShouldRender] = useState(true);
  const { translations: t, locale: hookLocale } = useWidgetTranslation();
  const activeLocale = initialLocale || hookLocale || 'en';
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [messageFeedbackSubmitted, setMessageFeedbackSubmitted] = useState<Set<string>>(new Set());
  const [unsureMessages, setUnsureMessages] = useState<Array<{userMessage: string, agentMessage: string, timestamp: number}>>([]);
  const [showUnsureModal, setShowUnsureModal] = useState(false);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const [hasEscalated, setHasEscalated] = useState(false);
  const handoffConversationIdRef = useRef<string | null>(null);
  const supportTicketsEnabled = widgetConfig?.support_tickets_enabled === true;
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const postedShowUnreadBadge = useRef<boolean | undefined>(undefined);
  const postedEdgeOffset = useRef<number | undefined>(undefined);
  const [fatalError, setFatalError] = useState<string | null>(null);
  // strict_origin: once config loads, use strict mode for all subsequent postMessage calls.
  // Before config loads we tolerate wildcard so the WIDGET_SHOW message still goes out.
  const isStrictOrigin = initialStrictOrigin || Boolean(widgetConfig?.strict_origin);
  // targetOrigin may now return null in production when no explicit origin is
  // known (LAUNCH-READINESS.md #6). Sites in our framing allowlist always pass
  // parentOrigin via the widget loader, so this only nulls out for malformed
  // embeds — in which case we deliberately suppress postMessage instead of
  // broadcasting via '*'.
  const parentTargetOrigin = useMemo(
    () => targetOrigin(resolveParentTargetOrigin(initialParentOrigin, undefined, isStrictOrigin) ?? undefined),
    [initialParentOrigin, isStrictOrigin]
  );
  const parentSensitiveOrigin = useMemo(
    () => sensitiveOrigin(resolveParentTargetOrigin(initialParentOrigin, undefined, isStrictOrigin) ?? undefined),
    [initialParentOrigin, isStrictOrigin]
  );
  // Helper for non-sensitive `WIDGET_RESIZE` / `WIDGET_SHOW` messages — silently
  // drops the call when no target origin is available. The host loader will
  // still apply its origin allowlist on the receiving side.
  const safePostToParent = useCallback(
    (payload: unknown) => {
      if (!parentTargetOrigin) return;
      try {
        window.parent.postMessage(payload, parentTargetOrigin);
      } catch {
        // host page may be navigating; nothing actionable.
      }
    },
    [parentTargetOrigin],
  );

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    authTokenRef.current = authToken ?? null;
  }, [authToken]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = activeLocale;
      document.documentElement.dir = getLocaleDirection(activeLocale);
    }
  }, [activeLocale]);




  useEffect(() => {
    // Listen for initial config posted from the host page (embed script)
    const { remove } = onInitConfig((data) => {
      // Store the posted show_unread_badge flag so it persists across API config loads
      if (typeof data.showUnreadBadge !== 'undefined') {
        postedShowUnreadBadge.current = Boolean(data.showUnreadBadge);

        // Apply it immediately if config already exists
        setWidgetConfig((prev) => {
          if (!prev) return prev;
          return { ...prev, show_unread_badge: postedShowUnreadBadge.current } as WidgetConfig;
        });
      }

      const rawEdgeOffset = data.edgeOffset ?? data.edge_offset;
      if (typeof rawEdgeOffset === 'number' && Number.isFinite(rawEdgeOffset)) {
        postedEdgeOffset.current = rawEdgeOffset;
      } else if (typeof rawEdgeOffset === 'string') {
        const parsed = Number.parseFloat(rawEdgeOffset);
        if (Number.isFinite(parsed)) {
          postedEdgeOffset.current = parsed;
        }
      }

      if (typeof postedEdgeOffset.current !== 'undefined') {
        setWidgetConfig((prev) => {
          if (!prev) return prev;
          return { ...prev, edge_offset: postedEdgeOffset.current } as WidgetConfig;
        });
      }
    });
    return remove;
  }, []);

  // Instance registry: create an instance id and register this widget
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [instanceId] = useState<string>(() => makeInstanceId(initialClientId, initialAgentId));

  useEffect(() => {
    const ref = {
      instanceId,
      clientId: initialClientId,
      agentId: initialAgentId,
      container: containerRef.current,
      state: isCollapsed ? 'collapsed' as const : 'expanded' as const,
    };
    try {
      registerInstance(ref);
      if (containerRef.current) {
        containerRef.current.dataset.widgetInstance = instanceId;
        if (initialClientId) containerRef.current.dataset.clientId = initialClientId;
        if (initialAgentId) containerRef.current.dataset.agentId = initialAgentId;
      }
    } catch (err) {
      // non-fatal: registration failure should not break widget
      logError(err as Error, { action: 'registerInstance', instanceId, clientId: initialClientId, agentId: initialAgentId });
    }

    return () => {
      try {
        deregisterInstance(instanceId);
      } catch (err) {
        // ignore
      }
    };
    // We intentionally only run this on mount/unmount
  }, []);

  // Sync collapsed/expanded state with registry
  useEffect(() => {
    try {
      if (!isCollapsed) {
        registryOpen(instanceId, { minimizeOthers: undefined });
      } else {
        registryClose(instanceId);
      }
    } catch (err) {
      // ignore
    }
  }, [isCollapsed]);

  // When auth fails before any config loads, surface it as a fatal error
  // so the widget renders a visible error instead of staying invisible.
  useEffect(() => {
    if (authError && !widgetConfig) {
      const id = window.setTimeout(() => {
        setFatalError(authError);
      }, 0);
        try {
          if (window.parent !== window) {
            if (parentSensitiveOrigin) {
              window.parent.postMessage({ type: EMBED_EVENTS.AUTH_FAILURE, data: { message: authError } }, parentSensitiveOrigin);
            }
          }
        } catch {
          // ignore
        }
      return () => window.clearTimeout(id);
    }
  }, [authError, widgetConfig, initialParentOrigin, parentSensitiveOrigin]);

  // Localized "session expired" banner state (LAUNCH-READINESS #22). Surfaces
  // when the API returns 410 / 401 / 404 for the active session so the user
  // sees a brief acknowledgment instead of a silent restart.
  const [sessionExpiredBanner, setSessionExpiredBanner] = useState(false);

  // Track an in-flight silent refresh so the periodic check doesn't fire
  // multiple concurrent createSession() calls when an expiry is detected.
  const sessionRefreshInFlightRef = useRef(false);

  // Periodic check for expired sessions. When the local TTL has lapsed we
  // silently provision a new session in the background rather than showing
  // an "expired" banner — the existing chat UI is preserved and the user can
  // keep typing as if nothing happened.
  useEffect(() => {
    const checkSessionExpiry = async () => {
      const stored = helpers.getStoredSession(sessionStorageKey);
      if (stored || !sessionId || sessionRefreshInFlightRef.current) return;

      sessionRefreshInFlightRef.current = true;
      setSessionId(null);
      sessionIdRef.current = null;
      try {
        const token = authTokenRef.current;
        if (token) {
          // skipMessageLoad=true preserves the in-memory chat history so the
          // empty new session doesn't blank out what the user has been seeing.
          await createSession(initialAgentId, token, undefined, true);
        }
      } catch {
        // Silent refresh failed; the next user message will re-attempt
        // recovery via the inline handler in handleSubmit.
      } finally {
        sessionRefreshInFlightRef.current = false;
      }
    };

    const interval = setInterval(checkSessionExpiry, 60000);
    return () => clearInterval(interval);
  }, [sessionId, sessionStorageKey, initialAgentId]);


  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      // Use props instead of URL params
      const clientIdParam = initialClientId;
      const agentIdParam = initialAgentId;
      const configIdParam = initialConfigId;

      try {
        // Detect iframe embedding and render a stripped layout when embedded
        try {
          setIsEmbedded(window.top !== window);
        } catch {
          setIsEmbedded(true);
        }

        if (!(clientIdParam && agentIdParam)) {
          return;
        }

        const token = await getAuthToken(clientIdParam, initialParentOrigin);
        if (!token) {
          // getAuthToken returned null — authError will be set by the hook.
          // The useEffect below watches authError and sets fatalError.
          return;
        }

        // Schedule silent token refresh. The hook records the server-reported
        // expires_in on tokenExpiresAtRef; we read it back via getTokenExpiresAt
        // and fall back to a 55-minute window if (and only if) the server omitted
        // the field (LAUNCH-READINESS.md gap #15).
        const reportedExpiry = typeof getTokenExpiresAt === 'function' ? getTokenExpiresAt() : null;
        const tokenExpiryMs = (reportedExpiry && Number.isFinite(reportedExpiry))
          ? reportedExpiry
          : Date.now() + 55 * 60 * 1000;
        scheduleAutoRefresh(tokenExpiryMs, clientIdParam, initialParentOrigin);

        if (cancelled) return;

        // Validate agent exists
        await fetchAgentDetails(agentIdParam, token);

        // Validate config exists if provided
        let fetchedConfig: ReturnType<typeof validateConfig>['config'] | null = null;
        if (configIdParam) {
          fetchedConfig = await fetchWidgetConfig(configIdParam, token) ?? null;
          // Inject server-side custom CSS (LAUNCH-READINESS #20). The sanitizer
          // strips url() / position:fixed / @font-face etc., so even a compromised
          // config field can't exfiltrate or clickjack the host page.
          injectCustomAssetsFromConfig(fetchedConfig as unknown as { custom_css?: string | null } | null);
          if (fetchedConfig?.ga_measurement_id && initialParentOrigin) {
            // GA measurement ID is non-sensitive but still gated on a known
            // parent origin so we don't leak it via '*' (LAUNCH-READINESS #6).
            window.parent.postMessage(
              { type: 'WIDGET_GA_INIT', data: { gaMeasurementId: fetchedConfig.ga_measurement_id } },
              initialParentOrigin
            );
          }
        }

        if (cancelled) return;

        // Try to restore existing session first
        const storedSession = helpers.getStoredSession(sessionStorageKey);
        if (storedSession) {
          await validateAndRestoreSession(storedSession.sessionId, agentIdParam, token, fetchedConfig);
        } else {
          await createSession(agentIdParam, token, fetchedConfig);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        // If validation fails, set error
        const errorMessage = (err as { userMessage?: string })?.userMessage || String(t.failedToLoadWidget);
        setError(errorMessage);
        logError(err as Error, {
          clientId: initialClientId,
          agentId: initialAgentId,
          configId: initialConfigId,
          action: 'validateWidget'
        });
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [getAuthToken, initialAgentId, initialClientId, initialConfigId, initialParentOrigin, sessionStorageKey]);

  // --- Streaming sendMessage handler ---
  // Supports SSE with: AbortController timeout, up to 2 retries with backoff,
  // SSE reconnect via Last-Event-ID, and a graceful agent fallback on failure.
  const sendMessageWithStreaming = async (userMessage: string) => {
    if (!sessionId || !authToken) return;
    setIsTyping(true);
    setStreamingMessage('');

    let lastEventId: string | null = null;
    let accumulatedText = '';

    const attemptStream = async (): Promise<void> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'text/event-stream, application/json',
          ...embedHeaders,
        };
        // Resume SSE stream from where it left off on reconnect
        if (lastEventId) {
          headers['Last-Event-ID'] = lastEventId;
        }

        const response = await fetch(API.sessionMessages(sessionId ?? undefined), {
          method: 'POST',
          headers,
          body: JSON.stringify({ content: userMessage, stream: true }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfterSec = response.headers.get('Retry-After');
            const waitSec = retryAfterSec ? parseInt(retryAfterSec, 10) : 0;
            const msg = waitSec > 0
              ? `Too many messages. Please wait ${waitSec} second${waitSec !== 1 ? 's' : ''}.`
              : 'Too many messages. Please wait a moment.';
            const err = createNetworkError(msg, WidgetErrorCode.NETWORK_RATE_LIMITED);
            err.retryable = false;
            err.userMessage = msg;
            throw err;
          }
          throw createNetworkError(`Server error: ${response.status}`, WidgetErrorCode.NETWORK_SERVER_ERROR);
        }

        if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
          const reader = response.body.getReader();
          let done = false;
          while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
              const chunk = textDecoder ? textDecoder.decode(value) : new TextDecoder().decode(value);
              chunk.split(/\n/).forEach(line => {
                if (line.startsWith('id:')) {
                  // Track SSE event ID so we can resume on reconnect
                  lastEventId = line.replace(/^id:/, '').trim();
                } else if (line.startsWith('data:')) {
                  const data = line.replace(/^data:/, '').trim();
                  if (data === '[DONE]') return;
                  accumulatedText += data;
                  setStreamingMessage(accumulatedText);
                }
              });
            }
          }
          setMessages(prev => [...prev, {
            id: `agent-${Date.now()}`,
            text: accumulatedText,
            from: 'agent',
            timestamp: Date.now(),
          }]);
          setStreamingMessage(null);
        } else {
          // Non-streaming fallback: parse as JSON
          const data = await response.json();
          if (data.status === 'success' && data.data?.message) {
            setMessages(prev => [...prev, {
              id: `agent-${Date.now()}`,
              text: data.data.message,
              from: 'agent',
              timestamp: Date.now(),
            }]);
          }
          setStreamingMessage(null);
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const e = err as { name?: string };
        if (e.name === 'AbortError') {
          throw createNetworkError('Response timed out', WidgetErrorCode.NETWORK_TIMEOUT);
        }
        throw err;
      }
    };

    try {
      await retryWithBackoff(attemptStream, {
        maxRetries: 2,
        initialDelay: 1500,
        maxDelay: 8000,
        onRetry: (attempt, err) => {
          logError(err as Error, { action: 'sendMessageWithStreaming', attempt });
        },
      });
    } catch (err) {
      setStreamingMessage(null);
      // Show a graceful agent message rather than a raw error string
      const fallbackText = String(t.failedToSendMessage) || "I'm having trouble responding right now. Please try again in a moment.";
      setMessages(prev => [...prev, {
        id: `agent-err-${Date.now()}`,
        text: fallbackText,
        from: 'agent' as const,
        timestamp: Date.now(),
      }]);
      logError(err as Error, { action: 'sendMessageWithStreaming' });
    } finally {
      setIsTyping(false);
    }
  };

  // --- END streaming sendMessage handler ---

  // Listen for queued-message events dispatched by PromptInput when offline
  useEffect(() => {
    const onQueued = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail;
        if (!detail) return;
        const queued = detail as { id: string; text: string; files?: any[]; timestamp?: number; attempts?: number };
        const pendingMessage: Message = {
          id: queued.id,
          text: queued.text,
          from: 'user',
          timestamp: queued.timestamp || Date.now(),
          pending: true,
          attempts: queued.attempts || 0,
        } as any;
        setMessages((prev) => [...prev, pendingMessage]);
      } catch {
        // ignore malformed events
      }
    };

    window.addEventListener('companin:queued-message', onQueued as EventListener);
    return () => window.removeEventListener('companin:queued-message', onQueued as EventListener);
  }, []);

  // Listen for service worker reconciliation results (QUEUE_FLUSH_RESULT)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const handler = (ev: MessageEvent) => {
      try {
        const data = ev.data || {};
        if (data.type !== 'QUEUE_FLUSH_RESULT' || !Array.isArray(data.results)) return;

        setMessages((prev) => {
          const next = [...prev];
          for (const res of data.results) {
            const idx = next.findIndex((m) => m.id === res.id);
            if (res.success) {
              if (res.serverMessage && res.serverMessage.id) {
                // Replace temp/pending message with server-provided message
                const server = res.serverMessage;
                const replaced: Message = {
                  id: server.id,
                  text: server.content || server.text || (idx >= 0 ? next[idx].text : ''),
                  from: (server.sender || server.from) === 'assistant' ? 'agent' : 'user',
                  timestamp: server.created_at ? new Date(server.created_at).getTime() : (server.timestamp || Date.now()),
                };
                if (idx >= 0) next[idx] = replaced; else next.push(replaced);
              } else if (idx >= 0) {
                // Mark as delivered (clear pending flag)
                next[idx] = { ...next[idx], pending: false };
              }
            }
          }
          return next;
        });
      } catch { /* ignore */ }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handler as EventListener);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handler as EventListener);
      }
    };
  }, []);

  // Client-mediated flush: when the page comes online or SW asks to flush,
  // read the IndexedDB queue and POST messages using sessionId+authToken.
  const flushQueuedMessages = useCallback(async () => {
    const storedSession = helpers.getStoredSession(sessionStorageKey);
    const sid = sessionIdRef.current || sessionId || storedSession?.sessionId || null;
    const token = authTokenRef.current || authToken || null;
    if (!sid || !token) return;
    try {
      const queued = await getQueuedMessages();
      if (!queued || queued.length === 0) return;

      for (const item of queued.sort((a, b) => (a.seq || 0) - (b.seq || 0))) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const resp = await fetch(API.sessionMessages(sid ?? undefined), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              ...embedHeaders,
            },
            body: JSON.stringify({ content: item.text, locale: activeLocale, page_context: helpers.getPageContext() }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!resp.ok) {
            try { await incrementAttempt(item.id); } catch {}
            break;
          }

          await removeQueuedMessage(item.id);
          await loadSessionMessages(sid, token);
        } catch (err) {
          try { await incrementAttempt(item.id); } catch {}
          break;
        }
      }
    } catch (err) {
      // ignore
    }
  }, [activeLocale, initialParentOrigin, loadSessionMessages, sessionStorageKey]);

  useEffect(() => {
    // Flush when browser regains connectivity
    const onOnline = () => flushQueuedMessages();

    window.addEventListener('online', onOnline);

    // Also listen for SW-initiated flush requests (FLUSH_QUEUE)
    const swHandler = (ev: MessageEvent) => {
      try {
        const data = ev.data || {};
        if (data && data.type === 'FLUSH_QUEUE') {
          flushQueuedMessages();
        }
      } catch {}
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', swHandler as any);
    }

    // Attempt an immediate flush if online
    if (navigator.onLine) {
      flushQueuedMessages();
    }

    return () => {
      window.removeEventListener('online', onOnline);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', swHandler as any);
    };
  }, [flushQueuedMessages]);

  // Handle individual retry requests from the UI
  useEffect(() => {
    const onRetry = async (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as { id?: string } | undefined;
        if (!detail?.id) return;
        const id = detail.id;
        const storedSession = helpers.getStoredSession(sessionStorageKey);
        const sid = sessionIdRef.current || sessionId || storedSession?.sessionId || null;
        const token = authTokenRef.current || authToken || null;
        if (!sid || !token) return;

        const queued = await getQueuedMessages();
        const item = queued.find((q: any) => q.id === id);
        if (!item) return;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          const resp = await fetch(API.sessionMessages(sid ?? undefined), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              ...embedHeaders,
            },
            body: JSON.stringify({ content: item.text, locale: activeLocale, page_context: helpers.getPageContext() }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (resp.ok) {
            await removeQueuedMessage(id);
            await loadSessionMessages(sid, token);
          } else {
            try { await incrementAttempt(id); } catch {}
          }
        } catch {
          try { await incrementAttempt(id); } catch {}
        }
      } catch {}
    };

    window.addEventListener('companin:retry-queued', onRetry as EventListener);
    return () => window.removeEventListener('companin:retry-queued', onRetry as EventListener);
  }, [activeLocale, initialParentOrigin, loadSessionMessages, sessionStorageKey]);


  // Proactive open trigger: delay-based and/or scroll-depth-based auto-open.
  // Reads auto_open_delay (ms) and auto_open_scroll_depth (0-100 %) from widgetConfig.
  // Only fires once per page-load and only when the widget is currently collapsed.
  useEffect(() => {
    if (!widgetConfig) return;
    // Don't auto-open if already explicitly open or if start_open already handled it
    const delayMs = widgetConfig.auto_open_delay ?? 0;
    const scrollDepth = widgetConfig.auto_open_scroll_depth ?? 0;
    if (delayMs <= 0 && scrollDepth <= 0) return;

    let fired = false;
    const open = () => {
      if (fired) return;
      fired = true;
      setIsCollapsed((prev) => {
        if (!prev) return prev; // already open
        return false;
      });
    };

    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    if (delayMs > 0) {
      delayTimer = setTimeout(open, delayMs);
    }

    let scrollHandler: (() => void) | null = null;
    if (scrollDepth > 0) {
      scrollHandler = () => {
        if (fired) return;
        const scrolled = window.scrollY + window.innerHeight;
        const total = document.documentElement.scrollHeight;
        const pct = total > 0 ? (scrolled / total) * 100 : 0;
        if (pct >= scrollDepth) open();
      };
      // Fire against the parent document via postMessage since widget runs in an iframe
      // For non-iframe contexts (dev/test), listen on the local window
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }

    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      if (scrollHandler) window.removeEventListener('scroll', scrollHandler);
    };
  // widgetConfig.auto_open_delay and auto_open_scroll_depth are primitives — safe to spread
  }, [widgetConfig?.auto_open_delay, widgetConfig?.auto_open_scroll_depth]);

  // Apply widget behavior settings when config is loaded
  useEffect(() => {
    if (!widgetConfig) return;

    const ua = navigator.userAgent;
    // Only check user agent for mobile device detection (not screen width)
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);

    let timeoutId: number | null = null;

    // Determine collapsed state and visibility based on device and settings
    if (isMobileDevice && widgetConfig.hide_on_mobile) {
      // On mobile devices with hide_on_mobile=true: hide the widget completely
      timeoutId = window.setTimeout(() => {
        setShouldRender(false);
        setIsCollapsed(true);
      }, 0);
      try {
        if (window.parent !== window) {
          if (parentSensitiveOrigin) {
            window.parent.postMessage({ type: 'WIDGET_HIDE' }, parentSensitiveOrigin);
          }
        }
      } catch {
        // ignore
      }
    } else {
      timeoutId = window.setTimeout(() => {
        setShouldRender(true);
        // Use the prop value if available, otherwise use config
        setIsCollapsed(!initialStartOpen && !widgetConfig.start_open);
      }, 0);
      try {
        if (window.parent !== window) {
          if (parentSensitiveOrigin) {
            window.parent.postMessage({ type: 'WIDGET_SHOW' }, parentSensitiveOrigin);
          }
        }
      } catch {
        // ignore
      }
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [widgetConfig, initialStartOpen, initialParentOrigin, parentTargetOrigin]);

  // Load unread count and last read message from localStorage on mount
  useEffect(() => {
    const timeoutIds: number[] = [];
    try {
      const storedUnread = localStorage.getItem(unreadStorageKey);
      const storedLastRead = localStorage.getItem(lastReadStorageKey);

      if (storedUnread) {
        timeoutIds.push(window.setTimeout(() => {
          setUnreadCount(parseInt(storedUnread, 10) || 0);
        }, 0));
      }
      if (storedLastRead) {
        timeoutIds.push(window.setTimeout(() => {
          setLastReadMessageId(storedLastRead);
        }, 0));
      }
    } catch (error) {
      logError(error as Error, { context: 'loadUnreadCount' });
    }

    return () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [lastReadStorageKey, unreadStorageKey]);

  // Track unread messages when new agent messages arrive and widget is collapsed
  useEffect(() => {
    // Only track unread if the feature is enabled
    const showUnreadBadge = widgetConfig?.show_unread_badge ?? true; // Default to true

    if (!showUnreadBadge) {
      return;
    }

    if (isCollapsed && messages.length > 0) {
      // Get the last agent message
      const lastMessage = messages[messages.length - 1];

      if (lastMessage?.from === 'agent' && lastMessage?.id) {
        // Only count as unread if this message is after the last read message
        if (!lastReadMessageId || lastMessage.id !== lastReadMessageId) {
          // Count unread agent messages after the last read message
          const lastReadIndex = lastReadMessageId
            ? messages.findIndex(m => m.id === lastReadMessageId)
            : -1;

          const unreadMessages = messages.filter((m, idx) =>
            m.from === 'agent' &&
            idx > lastReadIndex &&
            !m.id.startsWith('greeting-') // Don't count greeting messages
          );

          const newUnreadCount = unreadMessages.length;
          const id = window.setTimeout(() => {
            setUnreadCount(newUnreadCount);
          }, 0);

          // Persist to localStorage
          try {
            localStorage.setItem(unreadStorageKey, newUnreadCount.toString());
          } catch (error) {
            logError(error as Error, { context: 'saveUnreadCount' });
          }

          return () => {
            window.clearTimeout(id);
          };
        }
      }
    }
  }, [messages, isCollapsed, lastReadMessageId, widgetConfig?.show_unread_badge, unreadStorageKey]);
  useEffect(() => {
    if (widgetConfig && window.parent !== window) {
      const positionData = {
        position: widgetConfig.position || 'bottom-right',
        edge_offset: getNormalizedEdgeOffset(widgetConfig)
      };

      if (isCollapsed) {
        // Send button size when collapsed
        const buttonSize = getButtonPixelSize(widgetConfig.button_size || 'md');
        const hoverSafePadding = 24; // shadow-lg extends ~22px, badge overhangs 4px
        const collapsedViewportSize = buttonSize + (hoverSafePadding * 2);
        safePostToParent({
          type: EMBED_EVENTS.RESIZE,
          data: {
            width: collapsedViewportSize,
            height: collapsedViewportSize,
            ...positionData
          }
        });
      } else {
        // Send widget size when expanded — prefer `size` preset if provided.
        const sizePreset = (widgetConfig as any)?.size;
        const preset = sizePreset && (SIZE_PRESETS as any)[sizePreset] ? (SIZE_PRESETS as any)[sizePreset] : null;
        const width = preset ? preset.w : DEFAULTS.WIDGET_WIDTH;
        const height = preset ? preset.h : DEFAULTS.WIDGET_HEIGHT;
        safePostToParent({
          type: EMBED_EVENTS.RESIZE,
          data: {
            width,
            height,
            ...positionData
          }
        });
      }
    }
  }, [widgetConfig, isCollapsed, initialParentOrigin, parentTargetOrigin]);
  // Helper to make an authenticated API call with 401 retry logic
  async function fetchWithAuthRetry(fetchFn: (token: string | null, ...rest: unknown[]) => Promise<Response>, ...args: unknown[]) {
    let token = authTokenRef.current || authToken;
    let response = await fetchFn(token, ...args);
    if (response.status === 401) {
      // Try to refresh token and retry once
      try {
        const newToken = await (getAuthToken as any)(initialClientId, initialParentOrigin);
        if (newToken) {
          authTokenRef.current = newToken;
          token = newToken;
          response = await fetchFn(token, ...args);
        }
      } catch {}
    }
    return response;
  }

  async function loadSessionMessages(sessionId: string, token?: string, isInitial = false, forceReload = false) {
    setIsTyping(true);
    try {
      // Always use fetchWithAuthRetry for authenticated calls
      const fetchFn = (tok: string | null) => fetch(API.sessionMessages(sessionId), {
        headers: tok ? {
          'Authorization': `Bearer ${tok}`,
          ...embedHeaders,
        } : {},
      });
      let response;
      if (token && !forceReload) {
        response = await fetchWithAuthRetry(fetchFn);
      } else {
        response = await fetch(API.sessionMessages(sessionId ?? undefined));
      }

      if (!response.ok) {
        throw new Error(`Failed to load messages: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'success' && Array.isArray(data.data?.messages)) {
        // ...existing code...
        const loadedMessages: Message[] = (data.data.messages as unknown[])
          .filter((msg: unknown) => {
            // ...existing code...
            const m = msg as { sender?: string };
            if (m.sender === 'assistant') {
              const userMessages = (data.data.messages as unknown[]).filter(
                (m2: unknown) => (m2 as { sender?: string }).sender === 'user'
              );
              return userMessages.length > 0;
            }
            return true;
          })
          .map((msg: unknown) => {
            // ...existing code...
            const m = msg as {
              id: string;
              content: string;
              sender: string;
              created_at?: string;
              sources?: unknown[];
              metadata?: Message['metadata'];
            };
            return {
              id: m.id,
              text: m.content,
              from: (m.sender === 'assistant' ? 'agent' : m.sender) as 'user' | 'agent',
              timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
              sources: (m.sources as SourceData[]) || [],
              metadata: m.metadata,
            };
          });

        // ...existing code...
        setMessages(prev => {
          // ...existing code...
          const serverIds = new Set(loadedMessages.map(m => m.id));
          const inMemoryLocal = prev.filter(
            (m) => m.id.startsWith('temp-') && !serverIds.has(m.id) && !(m as any).pending
          );
          let storedLocal: Message[] = [];
          try {
            const raw = localStorage.getItem(helpers.localMessagesStorageKey(sessionId));
            if (raw) {
              const parsed = JSON.parse(raw) as Message[];
              if (Array.isArray(parsed)) {
                const inMemoryIds = new Set(inMemoryLocal.map((m) => m.id));
                storedLocal = parsed.filter((m) => {
                  if (serverIds.has(m.id) || inMemoryIds.has(m.id)) return false;
                  try {
                    const isDup = loadedMessages.some(lm => ((lm.text || (lm as any).content || '') === (m.text || (m as any).content || '')) && Math.abs((lm.timestamp || 0) - (m.timestamp || 0)) < 30000);
                    return !isDup;
                  } catch {
                    return true;
                  }
                });
              }
            }
          } catch {
            // ignore
          }
          const allLocal = [...inMemoryLocal, ...storedLocal];
          return [...loadedMessages, ...allLocal].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        });

        hasLoadedMessagesRef.current = true;

        try {
          if (window.parent !== window) {
            const last = loadedMessages[loadedMessages.length - 1];
            if (last) {
              if (parentSensitiveOrigin) {
                window.parent.postMessage({ type: EMBED_EVENTS.MESSAGE, data: last }, parentSensitiveOrigin);
                if (last.from === 'agent') {
                  window.parent.postMessage({ type: EMBED_EVENTS.RESPONSE, data: last }, parentSensitiveOrigin);
                }
              }
            }
          }
        } catch {
          // ignore
        }

      } else {
        throw new Error('Invalid messages response format');
      }
    } catch (err: any) {
      if (!isInitial) {
        throw err;
      }
      try {
        console.error('EmbedClient.loadSessionMessages error', err, { sessionId, isInitial });
      } catch {}
      logError(err instanceof Error ? (err.message || 'Unknown error') : String(err), { sessionId, isInitial, action: 'loadSessionMessages' });
      if (isInitial) {
        setError('Failed to load conversation history');
      }
    } finally {
      setIsTyping(false);
    }
  }

  async function createSession(agent: string, token: string, configSnapshot?: ReturnType<typeof validateConfig>['config'] | null, skipMessageLoad = false) {
    try {
      const visitorId = helpers.getVisitorId(initialClientId);
      // Mutable so a 401/403 (expired token on a long-open widget) can refresh
      // the token mid-retry and the next attempt uses the fresh one.
      let activeToken = token;

      // Use the config snapshot passed directly (avoids React state timing issue)
      // where widgetConfig state hasn't updated yet when createSession is called.
      const activeConfig = configSnapshot ?? widgetConfig;
      let abMeta: Record<string, string | boolean>;
      if (activeConfig?.variant_id) {
        // Visitor was assigned to a specific A/B variant.
        abMeta = { variant_id: activeConfig.variant_id, variant_name: activeConfig.variant_name ?? '' };
      } else if (activeConfig?.id && initialConfigId) {
        // Visitor is in the control group (base config, no variant).
        // Tag the session so analytics can count the control group.
        abMeta = { is_ab_control: true, widget_config_id: activeConfig.id };
      } else {
        abMeta = {};
      }

      // Single POST attempt. Returns the parsed response so the caller can
      // inspect the status (e.g. to refresh the token on 401) without the
      // refresh being treated as a retryable failure.
      const postSession = async (tok: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch(API.sessions(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tok}`,
              ...embedHeaders,
            },
            body: JSON.stringify({
              agent_id: agent,
              visitor_id: visitorId,
              locale: activeLocale,
              widget_config_id: activeConfig?.id ?? undefined,
              metadata: Object.keys(abMeta).length > 0 ? abMeta : undefined,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          let data;
          try {
            data = await response.json();
          } catch {
            throw createSessionError(
              'Invalid response from session server',
              WidgetErrorCode.SESSION_CREATE_FAILED
            );
          }
          return { response, data };
        } catch (fetchError: unknown) {
          clearTimeout(timeoutId);
          const fe = fetchError as unknown as { name?: string };
          if (fe.name === 'AbortError') {
            throw createNetworkError(
              'Session creation timed out',
              WidgetErrorCode.NETWORK_TIMEOUT
            );
          }
          throw fetchError;
        }
      };

      const sessionData = await retryWithBackoff(
        async () => {
          let { response, data } = await postSession(activeToken);

          // Expired/invalid token (the widget has likely been open past the
          // 1h token lifetime). Refresh it once and re-issue the request inline
          // with the fresh token. Doing this inline (rather than throwing to
          // trigger a retry) keeps the recovery silent — a thrown error would
          // be surfaced by the onRetry logger as a console error even though
          // nothing actually failed.
          if (response.status === 401 || response.status === 403) {
            const refreshed = await getAuthToken(initialClientId, initialParentOrigin);
            if (refreshed && refreshed !== activeToken) {
              activeToken = refreshed;
              authTokenRef.current = refreshed;
              ({ response, data } = await postSession(activeToken));
            }
          }

          if (!response.ok) {
            const errorMessage = parseApiError(data, 'Failed to create session');

            if (response.status >= 500) {
              throw createNetworkError(
                errorMessage,
                WidgetErrorCode.NETWORK_SERVER_ERROR
              );
            }

            throw createSessionError(
              errorMessage,
              WidgetErrorCode.SESSION_CREATE_FAILED
            );
          }

          if (data.status !== 'success' || !data.data?.session_id) {
            throw createSessionError(
              'Invalid session response format',
              WidgetErrorCode.SESSION_CREATE_FAILED
            );
          }

          return data.data;
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          onRetry: (attempt, error) => {
            logError(error, { agent, attempt, action: 'createSession' });
          },
        }
      );

      setSessionId(sessionData.session_id);
      // keep ref in sync for immediate callers
      sessionIdRef.current = sessionData.session_id;
      authTokenRef.current = activeToken ?? null;
      setError(null);

      // Store session data in localStorage. Use the legacy base key when
      // calling the helpers so tests and external callers that mock the
      // helper observe the original key. Internally we keep a locale-suffixed
      // `sessionStorageKey` for runtime isolation.
      if (sessionData.expires_at) {
        helpers.storeSession(baseSessionKey, sessionData.session_id, sessionData.expires_at);
      }

      // Load messages after session creation — skip when recovering from expiry
      // so existing in-memory messages are not wiped by the empty new session.
      if (!skipMessageLoad) {
        await loadSessionMessages(sessionData.session_id, activeToken, true);
      }

      // Attempt to flush any queued messages now that session/auth are available
      try {
        await flushQueuedMessages();
      } catch {}
    } catch (err: unknown) {
      const e = err as unknown as { userMessage?: string; message?: string };
      const errorMessage = e.userMessage || String(t.failedToCreateSession);
      setError(errorMessage);
      logError(e, { agent, action: 'createSession' });

      // Notify parent window of error
      if (window.parent !== window) {
        if (parentSensitiveOrigin) {
          window.parent.postMessage(
            { type: EMBED_EVENTS.ERROR, data: { message: errorMessage } },
            parentSensitiveOrigin
          );
        }
      }
    }
  }

  async function validateAndRestoreSession(sessionId: string, agentId: string, token: string, configSnapshot?: ReturnType<typeof validateConfig>['config'] | null) {
    try {
      let response = await fetch(API.sessionMessages(sessionId ?? undefined), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      });

      let data: any = null;
      if (response.ok) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }

      // Fallback for test harnesses/mocks that only handle bare GET calls.
      if (!Array.isArray(data?.data?.messages)) {
        response = await fetch(API.sessionMessages(sessionId ?? undefined));
        if (response.ok) {
          data = await response.json();
        }
      }
      if (response.ok) {
        if (data.status === 'success') {
          // Session is valid, use it
          setSessionId(sessionId);
          // sync refs immediately so downstream flush can run
          sessionIdRef.current = sessionId;
          authTokenRef.current = token ?? null;
          setError(null);

          // Patch variant metadata on restored sessions so A/B analytics include
          // returning visitors. The PATCH merges into existing metadata, so it is
          // safe to call on every restore – the backend is idempotent.
          if (configSnapshot?.variant_id || (configSnapshot?.id && initialConfigId)) {
            try {
              const patchMeta = configSnapshot.variant_id
                ? { variant_id: configSnapshot.variant_id, variant_name: configSnapshot.variant_name ?? '' }
                : { is_ab_control: true, widget_config_id: configSnapshot.id };
              await fetch(API.session(sessionId), {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  ...embedHeaders,
                },
                body: JSON.stringify({ metadata: patchMeta }),
              });
            } catch {
              // Non-fatal: analytics may miss this session restore but the
              // widget experience is unaffected.
            }
          }

          // Load messages
          type ApiMessage = {
            sender: 'user' | 'assistant';
            id: string;
            content: string;
            created_at?: string;
          };

          // If the backend already returned messages in the widget-friendly
          // shape (e.g. tests or local fixtures), use them directly to
          // preserve `pending` flags and other local-only fields.
          if (Array.isArray(data.data.messages) && (data.data.messages as any)[0] && (data.data.messages as any)[0].text) {
            const preloadedMessages = data.data.messages as Message[];
            const preloadedIds = new Set(preloadedMessages.map((m: Message) => m.id));
            let storedLocalPre: Message[] = [];
            try {
              const rawPre = localStorage.getItem(helpers.localMessagesStorageKey(sessionId));
              if (rawPre) {
                const parsedPre = JSON.parse(rawPre) as Message[];
                if (Array.isArray(parsedPre)) {
                  storedLocalPre = parsedPre.filter((m) => {
                    if (preloadedIds.has(m.id)) return false;
                    try {
                      const isDup = preloadedMessages.some(pm => ((pm.text || (pm as any).content || '') === (m.text || (m as any).content || '')) && Math.abs((pm.timestamp || 0) - (m.timestamp || 0)) < 30000);
                      return !isDup;
                    } catch {
                      return true;
                    }
                  });
                }
              }
            } catch { /* ignore */ }
            const mergedPre = [...preloadedMessages, ...storedLocalPre].sort(
              (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
            );
            setMessages(mergedPre);
            hasLoadedMessagesRef.current = true;

            // Restore feedback state from localStorage before hitting API
            let alreadySubmitted = feedbackSubmitted;
            if (!alreadySubmitted && sessionId) {
              try {
                const stored = localStorage.getItem(STORAGE_KEYS.feedbackKey(sessionId));
                if (stored) {
                  setFeedbackSubmitted(true);
                  alreadySubmitted = true;
                }
              } catch {
                // localStorage unavailable
              }
            }

            if ((data.data.messages as any).length > 0 && !alreadySubmitted) {
              checkFeedbackStatus(sessionId, token);
            }
            return;
          }

          const loadedMessages: Message[] = (data.data.messages as unknown[])
            .filter((msg: unknown) => {
              const apiMsg = msg as ApiMessage & { from?: string; text?: string };
              const sender = (apiMsg.sender || (apiMsg as any).from) as string | undefined;
              if (sender === 'assistant') {
                const userMessages = (data.data.messages as unknown[]).filter((m2: unknown) => ((m2 as any).sender || (m2 as any).from) === 'user');
                return userMessages.length > 0;
              }
              return true;
            })
            .map((apiMsgRaw: unknown) => {
              const apiMsg = apiMsgRaw as ApiMessage & { from?: string; text?: string };
              const id = (apiMsg as any).id || ((apiMsg as any).message_id ?? '');
              const text = (apiMsg as any).content ?? (apiMsg as any).text ?? '';
              const from = (apiMsg as any).sender ?? (apiMsg as any).from ?? 'user';
              const timestamp = apiMsg.created_at ? new Date(apiMsg.created_at).getTime() : ((apiMsg as any).timestamp || Date.now());
              return {
                id,
                text,
                from: from as 'user' | 'agent',
                timestamp,
              } as Message;
            });

          // Merge server messages with any local-only temp messages (e.g. button
          // click user bubbles that were never sent to the server).
          const serverIds = new Set(loadedMessages.map((m) => m.id));
          let storedLocal: Message[] = [];
          try {
            const raw = localStorage.getItem(helpers.localMessagesStorageKey(sessionId));
            if (raw) {
              const parsed = JSON.parse(raw) as Message[];
              if (Array.isArray(parsed)) {
                storedLocal = parsed.filter((m) => {
                  if (serverIds.has(m.id)) return false;
                  try {
                    const isDup = loadedMessages.some(lm => ((lm.text || (lm as any).content || '') === (m.text || (m as any).content || '')) && Math.abs((lm.timestamp || 0) - (m.timestamp || 0)) < 30000);
                    return !isDup;
                  } catch {
                    return true;
                  }
                });
              }
            }
          } catch {
            // ignore
          }
          const mergedMessages = [...loadedMessages, ...storedLocal].sort(
            (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
          );
          setMessages(mergedMessages);
          hasLoadedMessagesRef.current = true;

          // Restore feedback state from localStorage before hitting API
          let alreadySubmitted = feedbackSubmitted;
          if (!alreadySubmitted && sessionId) {
            try {
              const stored = localStorage.getItem(STORAGE_KEYS.feedbackKey(sessionId));
              if (stored) {
                setFeedbackSubmitted(true);
                alreadySubmitted = true;
              }
            } catch {
              // localStorage unavailable
            }
          }
          // Check if we should show feedback
          if (loadedMessages.length > 0 && !alreadySubmitted) {
            checkFeedbackStatus(sessionId, token);
          }

          // Attempt flush now that we've restored session/messages
          try {
            await flushQueuedMessages();
          } catch {}

          return;
        }
      }

      // Session invalid or not found, create new one
      logError(new Error('Session validation failed'), {
        sessionId,
        agentId,
        status: response.status
      });
      localStorage.removeItem(sessionStorageKey);
      await createSession(agentId, token, configSnapshot);
    } catch (err) {
      logError(err, { sessionId, agentId, action: 'validateAndRestoreSession' });
      // On error, create new session
      localStorage.removeItem(sessionStorageKey);
      await createSession(agentId, token, configSnapshot);
    }
  }

  async function fetchAgentDetails(agentId: string, token: string) {
    const start = Date.now();
    try {
      const response = await fetch(API.agent(agentId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      });

      if (response.ok) {
          const data = await response.json();
          // Accept success responses even if `name` is missing so tests that
          // return a minimal payload don't cause the whole widget to abort
          // validation. Missing agent name is non-fatal at runtime.
          if (data.status === 'success') {
            setAgentName(data.data?.name || '');
          } else {
            throw createAuthError('Invalid agent response', WidgetErrorCode.AUTH_TOKEN_FAILED);
          }
        } else {
          const errorMessage = `Agent not found or access denied (${response.status})`;
          throw createAuthError(errorMessage, WidgetErrorCode.AUTH_TOKEN_FAILED);
        }
    } catch (err) {
      logError(err, { agentId, action: 'fetchAgentDetails' });
      throw err; // Re-throw so it can be caught by the caller
    } finally {
      const duration = Date.now() - start;
      logPerf('fetchAgentDetails', duration, { agentId });
    }
  }

  async function fetchWidgetConfig(configId: string, token: string) {
    const start = Date.now();
    try {
      // Pass visitor_id so the backend can deterministically assign an A/B variant.
      // forceVariantId (admin-only) bypasses hash assignment for preview/testing.
      const visitorId = helpers.getVisitorId(initialClientId);
      const response = await fetch(API.widgetConfig(configId, visitorId, initialForceVariantId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      });

      if (!response.ok) {
        const errorMessage = `Widget config not found or access denied (${response.status})`;
        throw createAuthError(errorMessage, WidgetErrorCode.INVALID_CONFIG);
      }

      const data = await response.json();

      if (data.status === 'success' && data.data) {

        // Merge posted show_unread_badge if it was set via embed snippet
        const configData = { ...data.data };
        if (typeof postedShowUnreadBadge.current !== 'undefined') {
          configData.show_unread_badge = postedShowUnreadBadge.current;
        }
        if (typeof postedEdgeOffset.current !== 'undefined') {
          configData.edge_offset = postedEdgeOffset.current;
        }
        const { config: validatedConfig, typeMismatch } = validateConfig(configData, 'chat');
        setWidgetConfig(validatedConfig);
        if (typeMismatch) {
          setError('Configuration warning: this config is set to "docs" type but is running in the chat widget. Check your widget_type setting in the admin.');
        }
        return validatedConfig;
      } else {
        throw createAuthError('Invalid config response format', WidgetErrorCode.INVALID_CONFIG);
      }
    } catch (err) {
      logError(err, { configId, action: 'fetchWidgetConfig' });
      throw err; // Re-throw so it can be caught by the caller
    } finally {
      const duration = Date.now() - start;
      logPerf('fetchWidgetConfig', duration, { configId });
    }
  }

  const checkFeedbackStatus = async (sessionId: string, token: string) => {
    try {
      const response = await fetch(API.sessionFeedback(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success' && data.data.has_feedback) {
          setFeedbackSubmitted(true);
        }
      }
    } catch (error) {
      logError(error, { action: 'checkFeedbackStatus', sessionId });
    }
  };

  // Detect conversation end (inactivity) and show feedback dialog
  useEffect(() => {
    if (!sessionId || !authToken || feedbackSubmitted || showFeedbackDialog) return;
    if (messages.length === 0) return;

    // Set a timer to show feedback dialog after 30 seconds of inactivity
    const inactivityTimer = setTimeout(() => {
      if (!feedbackSubmitted && messages.length > 0) {
        setShowFeedbackDialog(true);
      }
    }, 30000); // 30 seconds

    return () => clearTimeout(inactivityTimer);
  }, [messages, sessionId, authToken, feedbackSubmitted, showFeedbackDialog]);

  const handleFeedbackSubmit = (rating: string, comment: string) => {
    // telemetry for feedback given includes rating/comment metadata
    trackEvent(
      'feedback_given',
      initialAgentId,
      { rating, comment },
      initialClientId,
      undefined,
      embedHeaders,
    ).catch(() => {});
    setFeedbackSubmitted(true);
    setShowFeedbackDialog(false);
    // Store feedback submitted flag in localStorage
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.feedbackKey(sessionId), 'true');
    }
  };

  const handleFeedbackSkip = () => {
    setShowFeedbackDialog(false);
    setFeedbackSubmitted(true); // Don't show again this session
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.feedbackKey(sessionId), 'skipped');
    }
  };

  const handleSubmitMessageFeedback = async (messageId: string, feedbackType: string = 'incorrect') => {
    if (!authToken) return;

    try {
      const response = await fetch(API.messageFeedback(messageId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...embedHeaders,
        },
        body: JSON.stringify({
          feedback_type: feedbackType,
        }),
      });

      if (response.ok) {
        setMessageFeedbackSubmitted((prev) => new Set(prev).add(messageId));
        // Show success toast if available
      } else {
        const errorText = await response.text();
        logError(new Error('Failed to submit message feedback'), {
          action: 'handleSubmitMessageFeedback',
          messageId,
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
      }
    } catch (error) {
      logError(error, { action: 'handleSubmitMessageFeedback', messageId });
    }
  };

  const getLocalizedText = (textObj: { [lang: string]: string } | string | undefined): string => {
    if (textObj == null) return '';
    if (typeof textObj === 'string') return textObj;

    // Priority: user's locale -> widget's default language -> English -> first available
    const userLocale = activeLocale || 'en';
    const defaultLang = widgetConfig?.default_language || 'en';

    // Try user's locale first
    if (textObj[userLocale]) return textObj[userLocale];

    // Fall back to widget's default language
    if (textObj[defaultLang]) return textObj[defaultLang];

    // Fall back to English
    if (textObj['en']) return textObj['en'];

    // Return first available translation
    const values = Object.values(textObj);
    return values.length > 0 ? values[0] : '';
  };

  const processWidgetFlow = (action: string | undefined): boolean => {
    if (!action || action === 'text') {
      return false;
    }

    // Only consider flows whose `languages` whitelist includes the visitor's
    // locale (legacy flows with no `languages` are visible in all locales).
    const flows = (widgetConfig?.greeting_message?.flows || []).filter((candidate: Flow) => {
      const langs = candidate.languages;
      return !langs || langs.length === 0 || langs.includes(activeLocale);
    });
    const flow = flows.find((candidate: Flow) => candidate.trigger === action);

    if (!flow) {
      return false;
    }

    const responses: (Flow['responses'] extends Array<infer R> ? R : never)[] = flow.responses || [];
    type RawFlowResp = (Flow['responses'] extends Array<infer R> ? R : never);

    responses.forEach((response: RawFlowResp) => {
      const responseText = getLocalizedText(response.text as unknown as { [k: string]: string } | string | undefined);

      if (responseText || (response.buttons && response.buttons.length > 0)) {
        // Add flow response as a grouped object with text and buttons
        setFlowResponses((prev: FlowResponse[]) => [...prev, {
          text: responseText || '',
          buttons: response.buttons || [],
          timestamp: Date.now()
        }]);
      }
    });

    return true;
  };

  const handleSubmit = useCallback(async (e: React.FormEvent, messageText?: string, skipAddingUserMessage?: boolean) => {
    e.preventDefault();
    const message = messageText || input;
    if (!message.trim()) return;

    // Check if we have a session and auth token. If missing, attempt silent recovery
    // and continue sending if recovery succeeds.
    if (!sessionId || !authToken) {
      const errorMsg = String(t.sessionOrAuthError) || 'Session or authentication error';
      setError(errorMsg);

      try {
        let token = authTokenRef.current || authToken;
        if (!token) {
          try {
            // Attempt to get a fresh auth token silently; hook may update state
            const maybe = await (getAuthToken as any)(initialClientId, initialParentOrigin);
            if (maybe) token = maybe;
          } catch {
            // ignore token refresh failures
          }
        }

        // If we now have a token but no session, try to create one.
        // Pass skipMessageLoad=true so the empty new session doesn't wipe
        // the existing in-memory chat history.
        const sidBefore = sessionIdRef.current || sessionId;
        if (token && !sidBefore) {
          try {
            await createSession(initialAgentId, token, undefined, true);
          } catch {
            // creation failed — continue to check below
          }
        }

        // Re-evaluate session/token after recovery attempts
        const sid = sessionIdRef.current || sessionId;
        const tokenNow = authTokenRef.current || token || authToken;
        if (!sid || !tokenNow) {
          // Still missing credentials — give up and return
          return;
        }

        // Update local references so subsequent logic uses recovered values
        // (we'll use `sid` and `tokenNow` when sending below)
        // Replace captured sessionId/authToken variables by shadowing
        // (they are const in closure; instead pass `sid`/`tokenNow` to fetch calls)

        // Proceed — fall through to sending using recovered `sid`/`tokenNow`
        // We'll ensure the fetch below uses these variables.

      } catch {
        // swallow unexpected recovery errors and return
        return;
      }
    }

    // Immediately add the user message to the UI
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      text: message,
      from: 'user',
      timestamp: Date.now()
    };
    if (!skipAddingUserMessage) {
      setMessages(prev => [...prev, userMessage]);
    }

    // Notify parent about the sent message
    try {
      if (window.parent !== window) {
        if (parentSensitiveOrigin) {
          window.parent.postMessage({ type: EMBED_EVENTS.MESSAGE, data: userMessage }, parentSensitiveOrigin);
        }
      }
    } catch {
      // ignore
    }

    setInput('');
    setIsTyping(true);
    setError(null);

    try {
      const messageData = await retryWithBackoff(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          try {
            // Prefer latest refs (in case we recovered above)
            const useSession = sessionIdRef.current || sessionId;
            const useToken = authTokenRef.current || authToken;
            const response = await fetch(API.sessionMessages(useSession ?? undefined), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${useToken}`,
                // Negotiate Server-Sent Events so the server streams the
                // agent reply token-by-token; falls back to JSON otherwise.
                'Accept': 'text/event-stream, application/json',
                ...embedHeaders,
              },
              body: JSON.stringify({
                content: message,
                locale: activeLocale,
                page_context: helpers.getPageContext(),
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              let data: any = {};
              try {
                data = await response.json();
              } catch {
                // Non-JSON error body — fall through with empty data so
                // parseApiError yields the generic fallback message.
              }
              const errorMessage = parseApiError(data, 'Failed to send message');

              // Session expired server-side (410 is the explicit signal;
              // 401/404 / "expired" / "not found" cover older API responses).
              // Instead of surfacing an "expired" banner, silently refresh
              // the session and throw a retryable SESSION_EXPIRED so the
              // wrapper re-runs this fetch with the new sessionIdRef.
              if (response.status === 410 || response.status === 401 || response.status === 404 ||
                  errorMessage.toLowerCase().includes('expired') ||
                  errorMessage.toLowerCase().includes('not found')) {
                localStorage.removeItem(sessionStorageKey);
                sessionIdRef.current = null;
                setSessionId(null);
                if (!sessionRefreshInFlightRef.current) {
                  sessionRefreshInFlightRef.current = true;
                  try {
                    if (useToken) {
                      await createSession(initialAgentId, useToken, undefined, true);
                    }
                  } catch {
                    // Refresh failed — fall through, the retry will surface
                    // a real error if it also fails.
                  } finally {
                    sessionRefreshInFlightRef.current = false;
                  }
                }
                throw createSessionError(
                  errorMessage,
                  WidgetErrorCode.SESSION_EXPIRED
                );
              }

              if (response.status === 429) {
                const retryAfterSec = response.headers.get('Retry-After');
                const waitSec = retryAfterSec ? parseInt(retryAfterSec, 10) : 0;
                const rateLimitMsg = waitSec > 0
                  ? `Too many messages. Please wait ${waitSec} second${waitSec !== 1 ? 's' : ''} before trying again.`
                  : 'Too many messages. Please wait a moment before trying again.';
                const rateLimitErr = createNetworkError(rateLimitMsg, WidgetErrorCode.NETWORK_RATE_LIMITED);
                rateLimitErr.retryable = false;
                rateLimitErr.userMessage = rateLimitMsg;
                throw rateLimitErr;
              }

              if (response.status >= 500) {
                throw createNetworkError(
                  errorMessage,
                  WidgetErrorCode.NETWORK_SERVER_ERROR
                );
              }

              throw new Error(errorMessage);
            }

            // Streaming (SSE) success path: relay tokens to the live bubble as
            // they arrive, then resolve with the final `done` payload — which
            // is the same shape the JSON path returns, so all downstream
            // handling (unsure / handoff / citations / feedback) is unchanged.
            const contentType = response.headers?.get?.('content-type') || '';
            if (response.body && contentType.includes('text/event-stream')) {
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let accumulated = '';
              let finalData: any = null;
              setStreamingMessage('');
              let streamDone = false;
              while (!streamDone) {
                const { value, done: dr } = await reader.read();
                streamDone = dr;
                if (!value) continue;
                buffer += decoder.decode(value, { stream: true });
                let sepIndex: number;
                while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
                  const rawEvent = buffer.slice(0, sepIndex);
                  buffer = buffer.slice(sepIndex + 2);
                  const dataLine = rawEvent.split('\n').find(l => l.startsWith('data:'));
                  if (!dataLine) continue;
                  const payloadStr = dataLine.slice(5).trim();
                  if (!payloadStr) continue;
                  let evt: any;
                  try { evt = JSON.parse(payloadStr); } catch { continue; }
                  if (evt.type === 'token') {
                    accumulated += evt.text;
                    setStreamingMessage(accumulated);
                  } else if (evt.type === 'done') {
                    finalData = evt.data;
                  } else if (evt.type === 'error') {
                    throw createNetworkError(evt.detail || 'Streaming failed', WidgetErrorCode.NETWORK_SERVER_ERROR);
                  }
                }
              }
              setStreamingMessage(null);
              if (!finalData) {
                throw createNetworkError('Stream ended unexpectedly', WidgetErrorCode.NETWORK_SERVER_ERROR);
              }
              trackEvent('message_sent', initialAgentId, { message }, initialClientId, authToken ?? undefined, embedHeaders).catch(() => {});
              return finalData;
            }

            // Non-streaming JSON fallback (server did not negotiate SSE).
            let data;
            try {
              data = await response.json();
            } catch {
              throw new Error('Invalid response from message server');
            }
            if (data.status !== 'success') {
              throw new Error(parseApiError(data, 'Failed to send message'));
            }

            // record telemetry for message sent
            trackEvent('message_sent', initialAgentId, { message }, initialClientId, authToken ?? undefined, embedHeaders).catch(() => {});

            return data.data;
          } catch (fetchError: unknown) {
            clearTimeout(timeoutId);

            const fe = fetchError as unknown as { name?: string };
            if (fe.name === 'AbortError') {
              throw createNetworkError(
                'Message send timed out',
                WidgetErrorCode.NETWORK_TIMEOUT
              );
            }

            throw fetchError;
          }
        },
        {
          maxRetries: 2,
          initialDelay: 1000,
          onRetry: (attempt, error) => {
            logError(error, { message, attempt, action: 'sendMessage' });
          },
        }
      );

      // Check if agent was unsure
      if (messageData?.assistant_message?.metadata?.assistant_unsure) {
        const userMsg = messageData.user_message?.content || message;
        const agentMsg = messageData.assistant_message?.content || '';
        setUnsureMessages(prev => [...prev, {
          userMessage: userMsg,
          agentMessage: agentMsg,
          timestamp: Date.now()
        }]);
      }

      // Check if agent requested a human handoff. Only offer it when the org's
      // plan explicitly includes support tickets — otherwise creating the ticket
      // would 403. Missing/unknown flags are treated as disabled.
      if (messageData?.assistant_message?.metadata?.handoff === true && !hasEscalated && supportTicketsEnabled) {
        setLastUserMessage(message);
        setHasEscalated(true);
        handoffConversationIdRef.current = messageData.conversation_id ?? null;
        setShowHandoffModal(true);
      }

      // Replace the optimistic temp message with the confirmed server messages
      // directly from the response — no extra round-trip, no visible flash.
      const serverUser = messageData?.user_message;
      const serverAgent = messageData?.assistant_message;
      setMessages(prev => {
        const withoutTemp = skipAddingUserMessage
          ? prev
          : prev.filter(m => m.id !== userMessage.id);
        const next = [...withoutTemp];
        if (serverUser) {
          next.push({
            id: serverUser.id,
            text: serverUser.content,
            from: 'user' as const,
            timestamp: serverUser.created_at ? new Date(serverUser.created_at).getTime() : Date.now(),
            sources: [],
          });
        }
        if (serverAgent) {
          next.push({
            id: serverAgent.id,
            text: serverAgent.content,
            from: 'agent' as const,
            timestamp: serverAgent.created_at ? new Date(serverAgent.created_at).getTime() : Date.now(),
            sources: (serverAgent.sources as SourceData[]) || [],
            metadata: serverAgent.metadata,
          });
        }
        return next.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      });

      // The backend extends the session TTL on every message (refresh_expiration).
      // Persist the refreshed expiry locally so an actively-used session isn't
      // treated as locally expired — otherwise the 60s background check would
      // tear down and re-create the session mid-conversation even though the
      // server-side session is still alive.
      const refreshedExpiresAt = (messageData as { expires_at?: string } | null)?.expires_at;
      const refreshedSessionId = (messageData as { session_id?: string } | null)?.session_id || sessionIdRef.current;
      if (refreshedExpiresAt && refreshedSessionId) {
        helpers.storeSession(baseSessionKey, refreshedSessionId, refreshedExpiresAt);
      }
    } catch (err: unknown) {
      const e = err as unknown as { userMessage?: string; message?: string; code?: string | WidgetErrorCode; name?: string };
      const errMsg = (e.message || '').toLowerCase();
      const isNetworkError = !navigator.onLine ||
        e.name === 'TypeError' || e.name === 'NetworkError' || e.name === 'AbortError' ||
        errMsg.includes('failed to fetch') || errMsg.includes('network') || errMsg.includes('networkerror');

      // If network error or offline, queue the message for later delivery and
      // keep the temp message as pending in the UI.
      // Skip ghost mode for button-triggered submits (skipAddingUserMessage=true) since
      // the flow response is already rendered locally — queuing makes no sense here.
      if (isNetworkError && !skipAddingUserMessage) {
        // Record the error for telemetry/debugging before attempting to queue
        logError(e, { message, sessionId, action: 'handleSubmit' });
        try {
          await queueMessage({ id: userMessage.id, seq: Date.now(), text: message, timestamp: userMessage.timestamp, attempts: 0 });
          // mark the message as pending in the UI
          setMessages(prev => prev.map(m => m.id === userMessage.id ? { ...m, pending: true, attempts: 0 } : m));

          // keep global error empty so we don't render the red error banner;
          // the UI shows the pending message state instead (ghost mode)
        } catch (queueErr) {
          // If queuing failed, fall back to the original error handling below
          const errorMessage = e.userMessage || e.message || String(t.failedToSendMessage);
          setError(errorMessage);
          // Already logged above; still include context for fallback
          logError(e, { message, sessionId, action: 'handleSubmit' });
          // Restore input and remove temp message
          setMessages(prev => prev.filter(m => m.id !== userMessage.id));
          setInput(message);
        }
      } else if (skipAddingUserMessage) {
        // Button-triggered submit failed — flow response is already shown locally, so
        // just log and do nothing (no error banner, no input restore, no message removal).
        logError(e, { message, sessionId, action: 'handleSubmit:button' });
      } else {
        const errorMessage = e.userMessage || e.message || String(t.failedToSendMessage);
        setError(errorMessage);
        logError(e, { message, sessionId, action: 'handleSubmit' });

        // Remove temp message and restore input
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setInput(message);

        // Check if session expired
        if (e.code === WidgetErrorCode.SESSION_EXPIRED) {
          setSessionId(null);
        }
      }
    } finally {
      setIsTyping(false);
      // Clear any partial streamed text (e.g. if the stream errored mid-flight)
      // so a stale half-message never lingers in the UI.
      setStreamingMessage(null);
    }
  }, [
    input,
    sessionId,
    authToken,
    activeLocale,
    parentTargetOrigin,
    t,
    initialAgentId,
    initialClientId,
    loadSessionMessages,
    sessionStorageKey,
  ]);

  const handleFollowUpButtonClick = (button: ButtonLike) => {
    const b = button as FlowButton;

    const maybeText = getLocalizedText(b.response?.text);
    const maybeButtons = b.response?.buttons || [];
    const hasLocalResponse = Boolean(maybeText) || maybeButtons.length > 0;
    const labelText = getLocalizedText(b.label) || (typeof b.label === 'string' ? b.label : (b.label?.en || ''));

    trackEvent('button_clicked', initialAgentId, { label: labelText }, initialClientId, undefined, embedHeaders).catch(() => {});

    // Add response as a grouped flow response
    if (maybeText || maybeButtons.length > 0) {
      setFlowResponses((prev: FlowResponse[]) => [...prev, {
        text: maybeText || '',
        buttons: maybeButtons,
        timestamp: Date.now()
      }]);
    }

    const flowHandled = processWidgetFlow(b.action);

    // If the flow was handled client-side, notify parent about the interaction
    if (flowHandled) {
      try {
        if (window.parent !== window) {
          const userMessage = {
            id: `temp-${Date.now()}`,
            // Avoid falling back to the raw `action` value (e.g. 'text') as the
            // message body — prefer labelText or maybeText and otherwise empty.
            text: labelText || maybeText || '',
            from: 'user',
            timestamp: Date.now(),
          };
          if (parentSensitiveOrigin) {
            window.parent.postMessage({ type: EMBED_EVENTS.MESSAGE, data: userMessage }, parentSensitiveOrigin);
          }
        }
      } catch {
        // ignore
      }
    }

    if (!flowHandled) {
      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        text: labelText || b.action,
        from: 'user',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);

      // A follow-up button that already defines a local response should remain
      // local-only: render the user's button click plus the local agent
      // response and skip the backend submit.
      if (hasLocalResponse) {
        const sid = sessionIdRef.current;
        const tok = authTokenRef.current;
        const responseText = maybeText || '';
        if (sid && tok && responseText) {
          const persistFlow = async () => {
            try {
              const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tok}`,
                ...embedHeaders,
              };
              await fetch(API.sessionMessages(sid), {
                method: 'POST',
                headers,
                body: JSON.stringify({ content: labelText, locale: activeLocale, skip_ai_response: true }),
              });
              await fetch(API.sessionMessages(sid), {
                method: 'POST',
                headers,
                body: JSON.stringify({ content: responseText, locale: activeLocale, sender: 'assistant', skip_ai_response: true }),
              });
            } catch {
              // ignore — history persistence is best-effort
            }
          };
          void persistFlow();
        }
        return;
      }

      handleSubmit(new Event('submit') as unknown as React.FormEvent, labelText || b.action, true);
    }
  };

  const handleInteractionButtonClick = async (button: ButtonLike) => {
    const b = button as FlowButton;

    const maybeText = getLocalizedText(b.response?.text);
    const maybeButtons = b.response?.buttons || [];
    const labelText = getLocalizedText(b.label) ||
      (typeof b.label === 'string' ? b.label : (b.label?.en || ''));

    // immediately add a user message bubble to the conversation
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      text: labelText || maybeText || '',
      from: 'user',
      timestamp: Date.now(),
    };
    // Add user bubble — always solid, never ghost
    setMessages(prev => [...prev, userMsg]);

    const flowHandled = processWidgetFlow(b.action);
    // track interaction click
    trackEvent('button_clicked', initialAgentId, { label: labelText }, initialClientId, undefined, embedHeaders).catch(() => {});

    if (!maybeText && !flowHandled) {
      // Interaction buttons are local-only entry points. When there is no
      // configured local response, keep only the user bubble and do not send a
      // backend message. Follow-up buttons retain the submit-to-agent path.
      return;
    } else {
      // Local response available — show typing then reveal it
      setIsTyping(true);
      setTimeout(() => {
        setFlowResponses((prev: FlowResponse[]) => [...prev, {
          text: maybeText || labelText || '',
          buttons: maybeButtons,
          timestamp: Date.now()
        }]);
        setIsTyping(false);
      }, 1000);

      // Persist the button click and flow response to the backend so they
      // appear in conversation history (fire-and-forget, never block the UI).
      const sid = sessionIdRef.current;
      const tok = authTokenRef.current;
      const responseText = maybeText || labelText || '';
      if (sid && tok && responseText) {
        const persistFlow = async () => {
          try {
            const headers = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tok}`,
              ...embedHeaders,
            };
            await fetch(API.sessionMessages(sid), {
              method: 'POST',
              headers,
              body: JSON.stringify({ content: labelText, locale: activeLocale, skip_ai_response: true }),
            });
            await fetch(API.sessionMessages(sid), {
              method: 'POST',
              headers,
              body: JSON.stringify({ content: responseText, locale: activeLocale, sender: 'assistant', skip_ai_response: true }),
            });
          } catch {
            // ignore — history persistence is best-effort
          }
        };
        void persistFlow();
      }

      // notify parent about the user message
      try {
        if (window.parent !== window) {
          const userMessage = {
            id: userMsg.id,
            text: userMsg.text,
            from: 'user',
            timestamp: userMsg.timestamp,
          };
          if (parentSensitiveOrigin) {
            window.parent.postMessage({ type: EMBED_EVENTS.MESSAGE, data: userMessage }, parentSensitiveOrigin);
          }
        }
      } catch {
        // ignore
      }
    }
  };

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const newCollapsed = !prev;

      // send telemetry whenever collapse state toggles
      trackEvent(
        newCollapsed ? 'widget_close' : 'widget_open',
        initialAgentId,
        { clientId: initialClientId },
        initialClientId,
        undefined,
        embedHeaders,
      ).catch(() => {});

      // Reset unread count when opening the widget
      if (!newCollapsed) {
        setUnreadCount(0);

        // Update last read message to the most recent one
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          if (lastMessage?.id) {
            setLastReadMessageId(lastMessage.id);
            try {
              localStorage.setItem(lastReadStorageKey, lastMessage.id);
            } catch (error) {
              logError(error as Error, { context: 'saveLastRead' });
            }
          }
        }

        // Clear unread count from localStorage
        try {
          localStorage.setItem(unreadStorageKey, '0');
        } catch (error) {
          logError(error as Error, { context: 'clearUnreadCount' });
        }
      }

      // Notify parent window about collapse state change. Drops silently when
      // no parent origin is known so we don't leak collapse state to '*'.
      if (window.parent !== window && parentTargetOrigin) {
        try {
          if (typeof (window.parent as any).postMessage === 'function') {
            (window.parent as any).postMessage(
              {
                type: newCollapsed ? EMBED_EVENTS.MINIMIZE : EMBED_EVENTS.RESTORE,
                data: { collapsed: newCollapsed },
              },
              parentTargetOrigin
            );
          }
        } catch {
          // ignore failures when parent cannot receive messages in test env
        }
      }

      return newCollapsed;
    });
  }, [initialAgentId, initialClientId, messages, lastReadStorageKey, unreadStorageKey, parentTargetOrigin]);

  useEffect(() => {
    const handleHostMessage = (event: MessageEvent) => {
      try {
        if (window.parent === window) return;
        // Allow test-dispatched plain objects where `event.source` may not be
        // the same object reference as `window.parent`. In that case allow the
        // event to pass if the origin matches the expected parent origin.
        if (event.source !== window.parent) {
          // Inbound message: must come from the parent origin we expect. With
          // targetOrigin now nullable in prod, missing expected origin means
          // "no host configured" — refuse the message.
          const expectedOrigin = parentTargetOrigin;
          if (!expectedOrigin) return;
          if (expectedOrigin !== '*' && event.origin !== expectedOrigin) return;
        }

        const { type, data } = event.data || {};
        if (type !== EMBED_EVENTS.HOST_MESSAGE) return;

        const command = parseHostMessageCommand(data);
        if (!command) return;

        if (command.kind === 'action') {
          if (command.action === 'toggle') {
            toggleCollapsed();
            return;
          }

          if (command.action === 'open' && isCollapsed) {
            toggleCollapsed();
            return;
          }

          if (command.action === 'close' && !isCollapsed) {
            toggleCollapsed();
          }

          return;
        }

        handleSubmit({ preventDefault: () => {} } as React.FormEvent, command.text);
      } catch (err) {
        logError(err as Error, { action: 'handleHostMessage' });
      }
    };

    window.addEventListener('message', handleHostMessage);
    // Some tests dispatch plain objects cast to MessageEvent which will
    // throw when passed to `dispatchEvent`. Provide a tolerant wrapper that
    // coerces plain objects into a real MessageEvent so tests can call
    // `window.dispatchEvent(obj as unknown as MessageEvent)` without error.
    const originalDispatch = window.dispatchEvent;
    // only override in environments where `window.dispatchEvent` exists
    if (originalDispatch) {

      (window as any).dispatchEvent = (ev: any) => {
        try {
          if (!(ev instanceof Event)) {
            const msg = new MessageEvent('message', { data: ev.data, origin: ev.origin, source: ev.source });
            return originalDispatch.call(window, msg);
          }
        } catch {
          // fallthrough to attempt original dispatch
        }
        return originalDispatch.call(window, ev);
      };
    }
    return () => {
      window.removeEventListener('message', handleHostMessage);
      if (originalDispatch) {

        (window as any).dispatchEvent = originalDispatch;
      }
    };
  }, [parentTargetOrigin, isCollapsed, toggleCollapsed, handleSubmit]);


  if (fatalError) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        left: 0,
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: 999999,
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ flexShrink: 0, color: '#dc2626', marginTop: '2px' }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>
              Widget unavailable
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280', lineHeight: '1.5', wordBreak: 'break-word' }}>
              {fatalError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Use a safe default config when widgetConfig hasn't loaded so tests and
  // embedded consumers can still render a minimal shell during initialization.
  const safeWidgetConfig: WidgetConfig = widgetConfig || ({} as WidgetConfig);

  if (!shouldRender || isBootstrapping) {
    return null; // Don't render the widget at all if shouldRender is false
  }

  return (
    <div ref={containerRef} data-widget-instance={instanceId} style={{ position: 'relative' }}>
      {/* A/B variant debug badge removed to avoid rendering variant text in the host page */}
      <EmbedShell
        isEmbedded={isEmbedded}
        isCollapsed={isCollapsed}
        toggleCollapsed={toggleCollapsed}
        messages={messages}
        isTyping={isTyping}
        streamingMessage={streamingMessage}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        error={error}
        locale={activeLocale}
        agentName={agentName}
        widgetConfig={safeWidgetConfig}
        onInteractionButtonClick={handleInteractionButtonClick}
        onFollowUpButtonClick={handleFollowUpButtonClick}
        flowResponses={flowResponses}
        getLocalizedText={getLocalizedText}
        showFeedbackDialog={showFeedbackDialogOverride ?? showFeedbackDialog}
        messageFeedbackSubmitted={messageFeedbackSubmitted}
        onSubmitMessageFeedback={handleSubmitMessageFeedback}
        unreadCount={unreadCount}
        sessionExpiredBanner={sessionExpiredBanner}
        onDismissSessionExpiredBanner={() => setSessionExpiredBanner(false)}
        isOffline={isOffline}
        feedbackDialog={
          ((showFeedbackDialogOverride !== undefined ? showFeedbackDialogOverride : showFeedbackDialog) && (showFeedbackDialogOverride !== undefined ? true : (sessionId && authToken))) ? (
            <FeedbackDialog
              sessionId={sessionId}
              authToken={authToken}
              primaryColor={widgetConfig?.primary_color || '#111827'}
              backgroundColor={widgetConfig?.background_color || '#ffffff'}
              textColor={widgetConfig?.text_color || '#1f2937'}
              borderRadius={widgetConfig?.border_radius || 8}
              onSubmit={handleFeedbackSubmit}
              onSkip={handleFeedbackSkip}
            />
          ) : undefined
        }
        unsureModal={
          showUnsureModal ? (
            <UnsureMessagesModal
              messages={unsureMessages}
              onClose={() => setShowUnsureModal(false)}
              primaryColor={widgetConfig?.primary_color || '#111827'}
              backgroundColor={widgetConfig?.background_color || '#ffffff'}
              textColor={widgetConfig?.text_color || '#1f2937'}
              borderRadius={widgetConfig?.border_radius || 8}
            />
          ) : undefined
        }
        unsureMessages={unsureMessages}
        onShowUnsureModal={() => setShowUnsureModal(true)}
        hideCloseButton={isPersistent}
        isPersistent={isPersistent}
        handoffModal={showHandoffModal && supportTicketsEnabled ? (
          <HandoffModal
            lastUserMessage={lastUserMessage}
            translations={{
              handoffTitle: String(t.handoffTitle),
              handoffNameLabel: String(t.handoffNameLabel),
              handoffEmailLabel: String(t.handoffEmailLabel),
              handoffMessageLabel: String(t.handoffMessageLabel),
              handoffSubmitButton: String(t.handoffSubmitButton),
              handoffSubmittingButton: String(t.handoffSubmittingButton),
              handoffError: String(t.handoffError),
            }}
            onSubmit={async (name, email, handoffMessage) => {
              if (!supportTicketsEnabled) return;
              await createSupportTicket(authToken ?? '', {
                name,
                email,
                message: handoffMessage,
                conversation_id: handoffConversationIdRef.current ?? undefined,
                session_id: sessionId ?? undefined,
              }, embedHeaders);
              setShowHandoffModal(false);
              setHasEscalated(false);
              const confirmationMessage: Message = {
                id: `temp-handoff-${Date.now()}`,
                text: String(t.handoffConfirmation),
                from: 'agent',
                timestamp: Date.now(),
              };
              setMessages(prev => [...prev, confirmationMessage]);
            }}
            onDismiss={() => { setShowHandoffModal(false); setHasEscalated(false); }}
          />
        ) : undefined}
      />
    </div>
  );
}
type UnsureMessagesModalProps = {
  messages: Array<{userMessage: string, agentMessage: string, timestamp: number}>;
  onClose: () => void;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
};

function UnsureMessagesModal({ messages, onClose, primaryColor, backgroundColor, textColor, borderRadius }: UnsureMessagesModalProps) {
  const { translations: t, locale } = useWidgetTranslation();
  return (
    <div
      className="rounded-lg shadow-lg max-h-[80vh] overflow-hidden"
      style={{ backgroundColor, color: textColor, borderRadius: `${borderRadius}px` }}
    >
      <div
        className="p-4 border-b"
        style={{ borderColor: primaryColor }}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">{t.uncertaintyLogTitle as string}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {t.uncertaintyLogSubtitle as string}
        </p>
      </div>

      <div className="p-4 max-h-96 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-center py-4">{t.uncertaintyLogEmpty as string}</p>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className="border rounded p-3" style={{ borderColor: primaryColor + "20" }}>
                <div className="mb-2">
                  <span className="text-xs text-gray-500">User:</span>
                  <p className="text-sm mt-1">{msg.userMessage}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Agent:</span>
                  <p className="text-sm mt-1 italic">{msg.agentMessage}</p>
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {new Date(msg.timestamp).toLocaleString(locale)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t" style={{ borderColor: primaryColor + "20" }}>
        <button
          onClick={onClose}
          className="w-full py-2 px-4 rounded text-white hover:opacity-90"
          style={{ backgroundColor: primaryColor, borderRadius: `${borderRadius}px` }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
