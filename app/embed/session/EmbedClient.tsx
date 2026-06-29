'use client';
import { useWidgetAuth } from '../../../hooks/useWidgetAuth';
import { useWidgetTranslation } from '../../../hooks/useWidgetTranslation';
import { getLocaleDirection, t as tFn } from '../../../lib/i18n';
import type {
  Message,
  WidgetConfig,
  FlowResponse,
  FlowButton,
  Flow,
  SourceData,
} from '../../../types/widget';
import { ButtonLike } from '../../../hooks/useClickedButtons';
import { validateMessageInput } from '../../../lib/validation';
import { checkAndConsume } from '../../../lib/rateLimiter';
import { trackEvent, embedOriginHeader, createSupportTicket } from '../../../lib/api';
import { HandoffModal } from '../HandoffModal';
import FeedbackDialog from '../../../components/FeedbackDialog';
import {
  createSessionError,
  createNetworkError,
  retryWithBackoff,
  logError,
  parseApiError,
  WidgetErrorCode,
} from '../../../lib/errorHandling';
import { API } from '../../../lib/api';
import { EMBED_EVENTS, targetOrigin, sensitiveOrigin } from '../../../lib/embedConstants';

import * as helpers from './helpers';
import { queueMessage } from '../../../src/lib/offline';
import { onInitConfig } from './events';
import { validateConfig } from '../../../lib/validateConfig';
import { enableDebug, disableDebug, useDebugMode, reportDevState, DevOverlay } from '../../../src/components/DevOverlay';
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
import {
  applyCustomAssetsFromQuery,
  isTrustedParentMessage,
  injectCustomAssetsFromConfig,
  injectCustomAssets,
  injectGoogleFont,
} from './EmbedClient.utils';
import { PREVIEW_COLLAPSED_KEY } from './EmbedClient.constants';
import {
  parseHostMessageCommand,
  resolveParentTargetOrigin,
  getNormalizedEdgeOffset,
} from './embed.utils';

// Re-export helpers so tests importing from 'EmbedClient' continue to work
export {
  injectCustomAssets,
  applyCustomAssetsFromQuery,
  isTrustedParentMessage,
  injectCustomAssetsFromConfig,
} from './EmbedClient.utils';
export {
  parseHostMessageCommand,
  resolveParentTargetOrigin,
  getNormalizedEdgeOffset,
  getButtonPixelSize,
} from './embed.utils';
import type { EmbedClientProps } from './EmbedClient.types';
import { UnsureMessagesModal } from './components/UnsureMessagesModal';
import { WidgetNotAuthorized } from '../../../components/WidgetNotAuthorized';
import { useStreamingMessage } from './hooks/useStreamingMessage';
import { useUnreadTracking } from './hooks/useUnreadTracking';
import { useWidgetResize } from './hooks/useWidgetResize';
import { useAutoOpen } from './hooks/useAutoOpen';
import { useSessionManagement } from './hooks/useSessionManagement';
import { useQueuedMessageManagement } from './hooks/useQueuedMessageManagement';
import { useFeedbackManagement } from './hooks/useFeedbackManagement';
import { useBootstrap } from './hooks/useBootstrap';

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
  previewConfig: initialPreviewConfig,
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

  // User identity set via chat.identify() — stored as a ref so the fetch
  // closure always sees the latest value without needing it in deps arrays.
  const identifiedUserRef = useRef<{
    userId?: string | null;
    email?: string | null;
    name?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null>(null);

  // Page context pushed via chat.setContext() — merged into every API request.
  const pageContextRef = useRef<Record<string, unknown>>({});

  // Track the last session ID we emitted WIDGET_CONVERSATION_CREATED for so we
  // don't fire it twice on re-renders.
  const lastEmittedSessionIdRef = useRef<string | null>(null);

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

  // NOTE: the consent and debug postMessage listeners live further down, after
  // `parentTargetOrigin` is defined, so they can validate the sender's origin.

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
  const {
    streamingMessage,
    setStreamingMessage,
    streamAbortControllerRef,
    streamAccumulatedRef,
    streamUserAbortedRef,
    streamPartialDroppedRef,
    handleStopStreaming,
  } = useStreamingMessage();
  const isSubmittingRef = useRef(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  // Guards preview open/closed persistence: stays false until the stored state
  // has been restored, so the initial default `true` can't clobber it first.
  const previewStateRestoredRef = useRef(false);

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
  const { getAuthToken, authToken, authError, authErrorCode, scheduleAutoRefresh = () => {}, getTokenExpiresAt } = useWidgetAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Tracks whether the initial loadSessionMessages has completed at least once.
  // Used to prevent the local-message persist effect from wiping localStorage
  // before loadSessionMessages has had a chance to read and restore the data.
  const hasLoadedMessagesRef = useRef(false);
  // Ensures the connectivity-flush effect performs its on-mount flush only once
  // even though the effect re-runs on every render (see flush effect below).
  const didInitialFlushRef = useRef(false);

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
  const [unsureMessages, setUnsureMessages] = useState<Array<{userMessage: string, agentMessage: string, timestamp: number}>>([]);
  const [showUnsureModal, setShowUnsureModal] = useState(false);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const [hasEscalated, setHasEscalated] = useState(false);
  const handoffConversationIdRef = useRef<string | null>(null);
  const supportTicketsEnabled = widgetConfig?.support_tickets_enabled === true;
  const postedShowUnreadBadge = useRef<boolean | undefined>(undefined);
  const postedEdgeOffset = useRef<number | undefined>(undefined);
  const {
    unreadCount,
    setUnreadCount,
    lastReadMessageId,
    setLastReadMessageId,
  } = useUnreadTracking({
    messages,
    isCollapsed,
    unreadStorageKey,
    lastReadStorageKey,
    showUnreadBadge: widgetConfig?.show_unread_badge ?? true,
  });
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

  // Emit WIDGET_READY once after the bootstrap phase completes.
  useEffect(() => {
    if (isBootstrapping) return;
    if (!parentSensitiveOrigin) return;
    try {
      window.parent.postMessage({ type: EMBED_EVENTS.READY }, parentSensitiveOrigin);
    } catch {
      // ignore — host may be navigating
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBootstrapping]);

  // Emit WIDGET_CONVERSATION_CREATED whenever a new session ID appears.
  useEffect(() => {
    if (!sessionId || sessionId === lastEmittedSessionIdRef.current) return;
    if (!parentSensitiveOrigin) return;
    lastEmittedSessionIdRef.current = sessionId;
    try {
      window.parent.postMessage(
        { type: EMBED_EVENTS.CONVERSATION_CREATED, data: { sessionId } },
        parentSensitiveOrigin,
      );
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Listen for consent grant/revoke from the host page via the widget loader's
  // postMessage relay (window.CompaninWidget.grantConsent / revokeConsent).
  // Origin-validated so a malicious framing page cannot forge consent.
  useEffect(() => {
    if (!initialConsentRequired) return;
    const handler = async (event: MessageEvent) => {
      if (!isTrustedParentMessage(event, parentTargetOrigin)) return;
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
  }, [initialConsentRequired, parentTargetOrigin]);

  // Allow the host page to toggle debug mode via postMessage (non-production only).
  // Origin-validated even though it is dev-gated, so preview deploys can't be
  // toggled into verbose logging by an arbitrary framing page.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const handler = (event: MessageEvent) => {
      if (!isTrustedParentMessage(event, parentTargetOrigin)) return;
      const t = event?.data?.type;
      if (t === 'WIDGET_DEBUG_ENABLE') enableDebug();
      else if (t === 'WIDGET_DEBUG_DISABLE') disableDebug();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [parentTargetOrigin]);

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
      // Abort any in-flight stream so we don't leak the connection / timeout timer
      // or run setState on an unmounted component. (#5)
      try {
        streamAbortControllerRef.current?.abort();
      } catch {
        // ignore
      }
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

  // When auth fails before any config loads, mark it as a fatal error so
  // the widget exits cleanly (null in prod, DevOverlay+error in debug).
  useEffect(() => {
    if (authError && !widgetConfig) {
      const id = window.setTimeout(() => {
        setFatalError(authError);
      }, 0);
        try {
          if (window.parent !== window) {
            if (parentSensitiveOrigin) {
              window.parent.postMessage({ type: EMBED_EVENTS.AUTH_FAILURE, data: { message: authError } }, parentSensitiveOrigin);
              // A denied origin is the most common silent first-install failure.
              // Relay it as a WIDGET_ERROR carrying a machine-readable code so the
              // loader emits an 'error' event (discoverable without ?widget_debug=1);
              // the diagnostic signal that drives the dashboard travels via backend
              // telemetry, not a visitor-facing card on the page.
              if (authErrorCode === WidgetErrorCode.ORIGIN_NOT_ALLOWED) {
                // Use source:'embed-error' so widget.js calls applyErrorContainerLayout
                // and makes the container visible (the iframe renders WidgetNotAuthorized).
                window.parent.postMessage(
                  { type: EMBED_EVENTS.ERROR, data: { code: 'origin_not_allowed', source: 'embed-error', width: 320, height: 140, message: authError } },
                  parentSensitiveOrigin,
                );
              }
            }
          }
        } catch {
          // ignore
        }
      return () => window.clearTimeout(id);
    }
  }, [authError, authErrorCode, widgetConfig, initialParentOrigin, parentSensitiveOrigin]);

  // Localized "session expired" banner state (LAUNCH-READINESS #22). Surfaces
  // when the API returns 410 / 401 / 404 for the active session so the user
  // sees a brief acknowledgment instead of a silent restart.
  const [sessionExpiredBanner, setSessionExpiredBanner] = useState(false);

  // Track an in-flight silent refresh so the periodic check doesn't fire
  // multiple concurrent createSession() calls when an expiry is detected.
  const sessionRefreshInFlightRef = useRef(false);

  // Stable ref to flushQueuedMessages — declared here so useSessionManagement
  // can call it via the ref without a circular hook dependency.
  const flushQueuedMessagesRef = useRef<() => Promise<void>>(async () => {});

  // Feedback management via hook
  const {
    showFeedbackDialog,
    setShowFeedbackDialog,
    feedbackSubmitted,
    setFeedbackSubmitted,
    messageFeedbackSubmitted,
    checkFeedbackStatus,
    handleFeedbackSubmit,
    handleFeedbackSkip,
    handleSubmitMessageFeedback,
  } = useFeedbackManagement({
    sessionId,
    authToken,
    messages,
    initialAgentId,
    initialClientId,
    embedHeaders,
    showFeedbackDialogOverride,
  });

  // Session management via hook
  const {
    loadSessionMessages,
    createSession,
    validateAndRestoreSession,
    fetchAgentDetails,
    fetchWidgetConfig,
  } = useSessionManagement({
    initialAgentId,
    initialClientId,
    initialConfigId,
    initialParentOrigin,
    initialForceVariantId,
    initialLocale,
    activeLocale,
    sessionStorageKey,
    baseSessionKey,
    embedHeaders,
    parentSensitiveOrigin,
    authToken,
    authTokenRef,
    getAuthToken,
    widgetConfig,
    setWidgetConfig,
    setAgentName,
    setError,
    setMessages,
    setSessionId,
    setFeedbackSubmitted,
    feedbackSubmitted,
    hasLoadedMessagesRef,
    sessionRefreshInFlightRef,
    t: t as Record<string, unknown>,
    checkFeedbackStatus,
    flushQueuedMessages: async () => { await flushQueuedMessagesRef.current?.(); },
    injectCustomAssetsFromConfig,
    postedShowUnreadBadge,
    postedEdgeOffset,
  });

  // Queued message management via hook
  const { flushQueuedMessages } = useQueuedMessageManagement({
    sessionId,
    sessionIdRef,
    authToken,
    authTokenRef,
    activeLocale,
    embedHeaders,
    sessionStorageKey,
    didInitialFlushRef,
    setMessages,
    loadSessionMessages,
  });

  // Keep the ref up-to-date so useSessionManagement can call the latest version
  useEffect(() => {
    flushQueuedMessagesRef.current = flushQueuedMessages;
  }, [flushQueuedMessages]);

  // Periodic check for expired sessions. When the local TTL has lapsed we
  // silently provision a new session in the background rather than showing
  // an "expired" banner — the existing chat UI is preserved and the user can
  // keep typing as if nothing happened.
  useEffect(() => {
    const checkSessionExpiry = async () => {
      // If storage is unavailable (private mode / disabled), nothing was ever
      // persisted, so a null stored session does NOT mean "expired". Treat the
      // in-memory session as authoritative instead of churning it every 60s. (#12)
      if (!helpers.isStorageAvailable()) return;
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

  // Bootstrap via hook
  useBootstrap({
    initialPreviewConfig,
    initialClientId,
    initialAgentId,
    initialConfigId,
    initialParentOrigin,
    sessionStorageKey,
    getAuthToken,
    scheduleAutoRefresh,
    getTokenExpiresAt,
    setWidgetConfig,
    setIsEmbedded,
    setIsBootstrapping,
    setError,
    fetchAgentDetails,
    fetchWidgetConfig,
    validateAndRestoreSession,
    createSession,
    t: t as Record<string, unknown>,
    postedShowUnreadBadge,
    postedEdgeOffset,
  });

  // Preview mode only: apply live config updates pushed from the admin customize
  // panel via postMessage. This lets the dashboard reflect appearance edits
  // without reloading the iframe (which would reset the widget to closed). The
  // config is the admin's own and is re-validated here, exactly as the URL-based
  // preview config is, so this introduces no new trust surface.
  useEffect(() => {
    if (!initialPreviewConfig) return;
    const handler = (event: MessageEvent) => {
      const data = event?.data as { type?: string; config?: string } | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'COMPANIN_PREVIEW_CONFIG' || typeof data.config !== 'string') return;
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(data.config)));
        const { config: validated } = validateConfig(decoded, 'chat');
        setWidgetConfig(validated);
        injectCustomAssetsFromConfig(validated as unknown as { custom_css?: string | null } | null);
        if ((validated as any).font_source === 'google' && (validated as any).font_family) {
          injectGoogleFont((validated as any).font_family);
        }
      } catch {
        // ignore malformed preview config
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [initialPreviewConfig]);

  // Signal to the admin preview panel that this iframe is mounted and ready to
  // receive config via postMessage. The admin page may have already fired its
  // onLoad postMessage before React hydration completed, so we re-request here.
  useEffect(() => {
    if (!initialPreviewConfig) return;
    window.parent.postMessage({ type: 'COMPANIN_PREVIEW_READY' }, '*');
  }, [initialPreviewConfig]);

  // handleStopStreaming is provided by useStreamingMessage hook above

  // Auto-open is handled by useAutoOpen hook
  useAutoOpen({ widgetConfig, setIsCollapsed });

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
        // Preview mode (admin "Customize" panel): config updates arrive live via
        // postMessage and re-run this effect. Once we've applied the initial
        // open/closed state we must NOT touch it again, or every appearance edit
        // would snap the widget shut. The initial state itself is restored from
        // localStorage so it also survives the iframe reloads caused by dev Fast
        // Refresh / type-locale changes. Scoped to preview — production is
        // unaffected.
        if (initialPreviewConfig && previewStateRestoredRef.current) {
          return;
        }
        // Use the prop value if available, otherwise use config
        let nextCollapsed = !initialStartOpen && !widgetConfig.start_open;
        if (initialPreviewConfig) {
          try {
            const stored = localStorage.getItem(PREVIEW_COLLAPSED_KEY);
            if (stored === 'true') nextCollapsed = true;
            else if (stored === 'false') nextCollapsed = false;
          } catch {
            // storage unavailable — fall back to the default
          }
          // Allow persistence only now that the stored state has been applied.
          previewStateRestoredRef.current = true;
        }
        setIsCollapsed(nextCollapsed);
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

  // Persist the open/closed state in preview mode so it survives the iframe
  // reloads triggered by config edits / Fast Refresh (see restore logic above).
  useEffect(() => {
    if (!initialPreviewConfig || !previewStateRestoredRef.current) return;
    try {
      localStorage.setItem(PREVIEW_COLLAPSED_KEY, String(isCollapsed));
    } catch {
      // storage unavailable — non-fatal, preview just won't remember state
    }
  }, [isCollapsed, initialPreviewConfig]);

  // Unread tracking is handled by useUnreadTracking hook above
  // Widget resize is handled by useWidgetResize hook
  useWidgetResize({
    widgetConfig,
    isCollapsed,
    initialParentOrigin,
    parentTargetOrigin,
    safePostToParent,
  });

  // Multi-tab session sync: when another tab creates or refreshes the session,
  // pick up the new sessionId so both tabs share the same conversation.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== sessionStorageKey || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue);
        const newSid = parsed?.sessionId;
        if (newSid && newSid !== sessionIdRef.current) {
          sessionIdRef.current = newSid;
          setSessionId(newSid);
          const token = authTokenRef.current || authToken;
          if (token) loadSessionMessages(newSid, token);
        }
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [sessionStorageKey, authToken, loadSessionMessages]);

  const getLocalizedText = (textObj: { [lang: string]: string } | string | undefined): string => {
    if (textObj == null) return '';
    if (typeof textObj === 'string') return textObj;

    // Priority: user's locale -> base locale -> widget's default language -> English -> first available
    const userLocale = activeLocale || 'en';
    const baseLocale = userLocale.split('-')[0];
    const defaultLang = widgetConfig?.default_language || 'en';

    // Try user's locale first (e.g. 'nb-NO'), then base code (e.g. 'nb')
    if (textObj[userLocale]) return textObj[userLocale];
    if (baseLocale !== userLocale && textObj[baseLocale]) return textObj[baseLocale];

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
    // Re-entrancy guard: block ANY submit while a send/stream is in flight. Button
    // and suggestion submits (skipAddingUserMessage) previously bypassed this, which
    // let a rapid double-click spawn concurrent streams that clobbered the shared
    // stream refs. (#7)
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    // Preview mode: add user message only — no dummy agent reply
    if (initialPreviewConfig) {
      const previewUserMsg: Message = {
        id: `preview-user-${Date.now()}`,
        text: message,
        from: 'user',
        timestamp: Date.now(),
      };
      if (!skipAddingUserMessage) setMessages(prev => [...prev, previewUserMsg]);
      setInput('');
      setError(null);
      isSubmittingRef.current = false;
      return;
    }

    // Validate and rate-limit user-typed messages. Flow/interaction-button sends use
    // app-controlled text and are exempt. This enforces MAX_MESSAGE_LENGTH and the
    // client throttle that the live composer previously bypassed entirely. (#2)
    // We gate on validity only and still send the original text (preserving newlines)
    // rather than the whitespace-collapsed `sanitized` value.
    if (!skipAddingUserMessage) {
      const validation = validateMessageInput(message);
      if (!validation.isValid) {
        setError(String(t.invalidMessage));
        isSubmittingRef.current = false;
        return;
      }
      const sidForLimit = sessionIdRef.current || sessionId;
      if (sidForLimit) {
        const rl = checkAndConsume(sidForLimit);
        if (!rl.allowed) {
          const waitSec = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 0;
          setError(
            waitSec > 0
              ? tFn(activeLocale, 'rateLimitWait', { count: waitSec })
              : String(t.rateLimitGeneric),
          );
          isSubmittingRef.current = false;
          return;
        }
      }
    }

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
          // Still missing credentials — give up. Reset the in-flight flag first,
          // otherwise every later send is silently blocked until remount. (#3)
          isSubmittingRef.current = false;
          return;
        }

        // Update local references so subsequent logic uses recovered values
        // (we'll use `sid` and `tokenNow` when sending below)
        // Replace captured sessionId/authToken variables by shadowing
        // (they are const in closure; instead pass `sid`/`tokenNow` to fetch calls)

        // Proceed — fall through to sending using recovered `sid`/`tokenNow`
        // We'll ensure the fetch below uses these variables.

      } catch {
        // swallow unexpected recovery errors and return — reset the in-flight
        // flag so the input isn't permanently bricked. (#3)
        isSubmittingRef.current = false;
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
          streamAbortControllerRef.current = controller;
          streamAccumulatedRef.current = '';
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
                page_context: {
                  ...helpers.getPageContext(),
                  ...pageContextRef.current,
                },
                ...(identifiedUserRef.current
                  ? { user_context: identifiedUserRef.current }
                  : {}),
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
                helpers.clearStoredSession(sessionStorageKey);
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
                  ? tFn(activeLocale, 'rateLimitWait', { count: waitSec })
                  : String(t.rateLimitGeneric);
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
              // Always cancel + release the reader so a server-sent error event, an
              // interrupted stream, or a timeout doesn't leak the locked body. (#5)
              try {
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
                      streamAccumulatedRef.current = accumulated;
                      setStreamingMessage(accumulated);
                    } else if (evt.type === 'done') {
                      finalData = evt.data;
                    } else if (evt.type === 'error') {
                      // Log the server-supplied detail but show users a localized,
                      // generic message — never raw server internals. (#13)
                      if (evt.detail) logError(new Error(String(evt.detail)), { action: 'handleSubmit:streamError' });
                      throw createNetworkError(String(t.serverError), WidgetErrorCode.NETWORK_SERVER_ERROR);
                    }
                  }
                }
              } finally {
                try { await reader.cancel(); } catch { /* already closed */ }
                try { reader.releaseLock(); } catch { /* already released */ }
              }
              setStreamingMessage(null);
              if (!finalData) {
                if (accumulated) streamPartialDroppedRef.current = true;
                throw createNetworkError(String(t.streamInterrupted), WidgetErrorCode.NETWORK_SERVER_ERROR);
              }
              trackEvent('message_sent', initialAgentId, { message }, initialClientId, authToken ?? undefined, embedHeaders).catch(() => {});
              return finalData;
            }

            // Non-streaming JSON fallback (server did not negotiate SSE).
            let data;
            try {
              data = await response.json();
            } catch {
              throw new Error(String(t.invalidServerResponse));
            }
            if (data.status !== 'success') {
              // Log the parsed server error for diagnostics, but surface a localized
              // generic message to the user rather than raw server detail. (#13)
              logError(new Error(parseApiError(data, 'unknown server error')), { action: 'handleSubmit:apiError' });
              throw createNetworkError(String(t.serverError), WidgetErrorCode.NETWORK_SERVER_ERROR);
            }

            // record telemetry for message sent
            trackEvent('message_sent', initialAgentId, { message }, initialClientId, authToken ?? undefined, embedHeaders).catch(() => {});

            return data.data;
          } catch (fetchError: unknown) {
            clearTimeout(timeoutId);

            const fe = fetchError as unknown as { name?: string };
            if (fe.name === 'AbortError') {
              throw createNetworkError(
                String(t.messageSendTimeout),
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
      if (streamUserAbortedRef.current) {
        streamUserAbortedRef.current = false;
        const partial = streamAccumulatedRef.current;
        setStreamingMessage(null);
        if (partial) {
          setMessages(prev => [...prev, {
            id: `agent-stop-${Date.now()}`,
            text: partial,
            from: 'agent',
            timestamp: Date.now(),
          }]);
        }
        return;
      }
      if (streamPartialDroppedRef.current) {
        streamPartialDroppedRef.current = false;
        const partial = streamAccumulatedRef.current;
        setStreamingMessage(null);
        if (partial) {
          setMessages(prev => [...prev, {
            id: `agent-partial-${Date.now()}`,
            text: partial,
            from: 'agent',
            timestamp: Date.now(),
          }]);
        }
        return;
      }
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
          // If queuing failed, fall back to the original error handling below.
          // Use only our localized userMessage / generic fallback — never raw
          // e.message, which can carry server internals. (#13)
          const errorMessage = e.userMessage || String(t.failedToSendMessage);
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
        // Only our localized userMessage / generic fallback — never raw e.message. (#13)
        const errorMessage = e.userMessage || String(t.failedToSendMessage);
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
      streamAbortControllerRef.current = null;
      isSubmittingRef.current = false;
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

    // Always show the clicked button label as a user bubble immediately.
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      text: labelText || b.action || '',
      from: 'user',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

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
        if (window.parent !== window && parentSensitiveOrigin) {
          window.parent.postMessage({ type: EMBED_EVENTS.MESSAGE, data: userMsg }, parentSensitiveOrigin);
        }
      } catch {
        // ignore
      }
      return;
    }

    // A follow-up button that already defines a local response should remain
    // local-only: the user bubble + agent response are already rendered; skip
    // the backend submit.
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

    // Render any keyword-flow reply triggered by this button's action. The flow's
    // reply is added by processWidgetFlow itself.
    const flowFired = processWidgetFlow(b.action);
    // track interaction click
    trackEvent('button_clicked', initialAgentId, { label: labelText }, initialClientId, undefined, embedHeaders).catch(() => {});

    // A button can define its OWN local response (response.text and/or follow-up
    // buttons) and/or trigger a keyword flow via its action. The button's *label*
    // is never a response — only echo a reply bubble when the button actually has
    // its own configured response (maybeText/maybeButtons), and use that text
    // verbatim (no labelText fallback). A flow-only button has no own response, so
    // its reply comes solely from processWidgetFlow above; echoing the label here
    // would render it a second time as an agent bubble (the duplicate the user saw).
    const hasOwnResponse = Boolean(maybeText) || maybeButtons.length > 0;

    if (hasOwnResponse) {
      // Local response available — show typing then reveal it
      setIsTyping(true);
      setTimeout(() => {
        setFlowResponses((prev: FlowResponse[]) => {
          if (flowFired && prev.length > 0) {
            // A flow already added a response with its own buttons. Inject the
            // button's response text ABOVE those buttons by splitting the last
            // flow entry: text-only first, then button text + combined buttons.
            const last = prev[prev.length - 1];
            const rest = prev.slice(0, -1);
            return [
              ...rest,
              { text: last.text, buttons: [], timestamp: last.timestamp },
              { text: maybeText, buttons: [...last.buttons, ...maybeButtons], timestamp: last.timestamp + 1 },
            ];
          }
          return [...prev, { text: maybeText, buttons: maybeButtons, timestamp: Date.now() }];
        });
        setIsTyping(false);
      }, 1000);

      // Persist the button click and its local response to the backend so they
      // appear in conversation history (fire-and-forget, never block the UI).
      const sid = sessionIdRef.current;
      const tok = authTokenRef.current;
      const responseText = maybeText;
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
    }

    // notify parent about the user message (always — the user bubble is added
    // regardless of whether the button had its own response or triggered a flow)
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
            return;
          }

          if (command.action === 'reset') {
            // Clear conversation history; mark session as gone so the next
            // handleSubmit call opens a fresh one automatically.
            setMessages([]);
            setFlowResponses([]);
            sessionIdRef.current = null;
            hasLoadedMessagesRef.current = false;
            lastEmittedSessionIdRef.current = null;
            if (parentSensitiveOrigin) {
              try {
                window.parent.postMessage({ type: EMBED_EVENTS.CONVERSATION_CLOSED }, parentSensitiveOrigin);
              } catch { /* ignore */ }
            }
            return;
          }

          if (command.action === 'identify') {
            const u = command.data as Record<string, unknown> | null | undefined;
            if (u && typeof u === 'object') {
              const safe = {
                userId: ((u.userId || u.id) as string | null) ?? null,
                email: typeof u.email === 'string' ? u.email : null,
                name: typeof u.name === 'string' ? u.name : null,
                metadata: (u.metadata && typeof u.metadata === 'object')
                  ? u.metadata as Record<string, unknown>
                  : null,
              };
              identifiedUserRef.current = safe;
              if (parentSensitiveOrigin) {
                try {
                  window.parent.postMessage(
                    { type: EMBED_EVENTS.USER_UPDATED, data: safe },
                    parentSensitiveOrigin,
                  );
                } catch { /* ignore */ }
              }
            }
            return;
          }

          if (command.action === 'prefill') {
            const d = command.data as Record<string, unknown> | null | undefined;
            const text = typeof d?.text === 'string' ? d.text : '';
            if (text) setInput(text);
            return;
          }

          if (command.action === 'context') {
            const d = command.data as Record<string, unknown> | null | undefined;
            if (d && typeof d === 'object') {
              // Merge into the ref — excluded keys are internal action routing fields.
              const { action: _a, ...rest } = d as { action?: unknown; [k: string]: unknown };
              pageContextRef.current = { ...pageContextRef.current, ...rest };
            }
            return;
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
            let msg: MessageEvent;
            try {
              // `source` must be a Window/MessagePort/ServiceWorker; jsdom (and
              // browsers) reject plain objects. Try with source first, then fall
              // back to origin-only so plain test objects still dispatch.
              msg = new MessageEvent('message', { data: ev.data, origin: ev.origin, source: ev.source });
            } catch {
              msg = new MessageEvent('message', { data: ev.data, origin: ev.origin });
            }
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


  // Developer overlay: only active in non-production when debug mode is on
  // (?widget_debug=1, localStorage, data-dev, or CompaninWidget.enableDebug()).
  const isDebug = useDebugMode();

  // Feed the live state snapshot to the DevOverlay "State" tab. No-op cost when
  // not debugging — the overlay isn't mounted so there are no listeners.
  useEffect(() => {
    if (!isDebug) return;
    reportDevState({
      sessionId,
      clientId: initialClientId,
      agentId: initialAgentId,
      configId: initialConfigId,
      messageCount: messages.length,
      offline: isOffline,
      handshake: isBootstrapping ? 'INIT' : sessionId ? 'CONNECTED' : 'READY',
      authTokenExpiresAt:
        typeof getTokenExpiresAt === 'function' ? getTokenExpiresAt() : null,
      config: (widgetConfig as unknown as Record<string, unknown>) ?? null,
    });
  }, [
    isDebug,
    sessionId,
    messages.length,
    isOffline,
    isBootstrapping,
    widgetConfig,
    initialClientId,
    initialAgentId,
    initialConfigId,
    getTokenExpiresAt,
  ]);

  if (fatalError) {
    // Origin violations show a visible error even in production — a blank widget
    // on an unauthorized domain is indistinguishable from a load failure for site
    // owners. All other fatal errors stay silent (parent got AUTH_FAILURE).
    if (authErrorCode === WidgetErrorCode.ORIGIN_NOT_ALLOWED) {
      return <WidgetNotAuthorized />;
    }
    // In production integrations, silently render nothing — a broken widget
    // is less disruptive than a red error box on the host site. The parent
    // already received an AUTH_FAILURE postMessage for programmatic handling.
    if (!isDebug) return null;
    return (
      <>
      <DevOverlay />
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
      </>
    );
  }

  // Use a safe default config when widgetConfig hasn't loaded so tests and
  // embedded consumers can still render a minimal shell during initialization.
  const safeWidgetConfig: WidgetConfig = widgetConfig || ({} as WidgetConfig);

  if (!shouldRender || isBootstrapping) {
    // Still surface the overlay while bootstrapping so the handshake/auth
    // sequence is observable — this is the most useful time to debug.
    return isDebug ? <DevOverlay /> : null;
  }

  return (
    <div ref={containerRef} data-widget-instance={instanceId} style={{ position: 'relative' }}>
      {/* A/B variant debug badge removed to avoid rendering variant text in the host page */}
      <EmbedShell
        isEmbedded={isEmbedded}
        isCollapsed={isCollapsed}
        isPreview={!!initialPreviewConfig}
        previewPositioning={!!initialPreviewConfig}
        toggleCollapsed={toggleCollapsed}
        messages={messages}
        isTyping={isTyping}
        onStopStreaming={handleStopStreaming}
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
        onCloseUnsureModal={() => setShowUnsureModal(false)}
        onDismissHandoff={() => setShowHandoffModal(false)}
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
              dismiss: String(t.dismiss),
            }}
            primaryColor={widgetConfig?.primary_color || '#111827'}
            backgroundColor={widgetConfig?.background_color || '#ffffff'}
            textColor={widgetConfig?.text_color || '#1f2937'}
            borderRadius={widgetConfig?.border_radius || 8}
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
