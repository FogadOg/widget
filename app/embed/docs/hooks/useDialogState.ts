import React, { useCallback, useEffect, useRef } from 'react'
import { API, trackConversion } from '../../../../lib/api'
import { validateConfig } from '../../../../lib/validateConfig'
import { logError, logWarn } from '../../../../lib/logger'
import { enableDebug, disableDebug, simulateOffline, restoreOnline } from '../../../../src/components/DevOverlay'
import { setLogLevel, enableLogStream, disableLogStream } from '../../../../lib/logger'
import {
  getStoredSession as helpersGetStoredSession,
  clearStoredSession as helpersClearStoredSession,
} from '../helpers'
import { clearHostContext, mergeHostContext } from '../hostContext'
// The host-command grammar is shared with the chat widget so both embeds accept
// exactly the same messages from `CompaninWidget` / `CompaninDocsWidget`.
import { parseHostMessageCommand } from '../../session/embed.utils'
import { isTrustedParentMessage } from '../DocsClient.utils'
import { DOCS_SEARCH_BAR_SIZE } from '../DocsClient.constants'
import { MessageType } from '../DocsClient.types'
import { t as translate } from '../../../../lib/i18n'

interface UseDialogStateParams {
  open: boolean;
  /** Visitor's locale — the auth failure below is shown to them. */
  activeLocale: string;
  setOpen: (open: boolean) => void;
  /**
   * True while the collapsed bottom search bar is on screen. Drives the
   * iframe footprint the loader is asked for (bar-sized instead of hidden).
   */
  searchBarVisible: boolean;
  /** Footprint the bar measured for itself; falls back to the constant. */
  searchBarSize?: { width: number; height: number } | null;
  parentOrigin: string;
  initialPreviewConfig?: string;
  clientId: string;
  agentId: string;
  configId: string;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>;
  setError: (err: string | null) => void;
  setWidgetConfig: (config: any) => void;
  widgetConfig: any;
  authError?: string | null;
  embedHeaders: Record<string, string>;
  getAuthToken: (clientId: string, parentOrigin?: string, userToken?: string | null) => Promise<string | null>;
  fetchWidgetConfig: (configId: string, token: string) => Promise<{ variant_id?: string; variant_name?: string } | undefined>;
  createSession: (token: string, variantInfo?: { variant_id?: string; variant_name?: string }) => Promise<void>;
  validateAndRestoreSession: (sessionId: string, token: string) => Promise<void>;
  resolveParentOrigin: () => string | undefined;
  messages?: MessageType[];
  error?: string | null;
  /**
   * Host-page API surface (`CompaninDocsWidget.*`). Every command the loader
   * can post has a handler here — parity with the chat widget, where a missing
   * handler would make the documented API silently no-op.
   */
  hostActions: {
    /** prefill(text) — drop text into the composer without sending. */
    prefill: (text: string) => void;
    /** sendMessage(text) — open the panel and send as the visitor. */
    sendText: (text: string) => void;
    /** setTheme(theme) — override the configured light/dark palette. */
    setThemeOverride: (theme: 'light' | 'dark' | 'system') => void;
    /** Flush messages queued while offline (service-worker FLUSH_QUEUE). */
    flushQueue: () => void;
  };
}

export function useDialogState({
  open,
  activeLocale,
  setOpen,
  searchBarVisible,
  searchBarSize,
  parentOrigin,
  initialPreviewConfig,
  clientId,
  agentId,
  configId,
  sessionId,
  setSessionId,
  setMessages,
  setError,
  setWidgetConfig,
  widgetConfig,
  authError,
  embedHeaders,
  getAuthToken,
  fetchWidgetConfig,
  createSession,
  validateAndRestoreSession,
  resolveParentOrigin,
  messages,
  error,
  hostActions,
}: UseDialogStateParams) {
  // The session-init effect below runs once per open and deliberately doesn't
  // re-run on a language switch, so read the locale through a ref.
  const localeRef = useRef(activeLocale);
  localeRef.current = activeLocale;
  // Callbacks come from the client's render scope; reading them through a ref
  // keeps the message listener from re-subscribing on every render.
  const hostActionsRef = useRef(hostActions);
  useEffect(() => { hostActionsRef.current = hostActions; });
  // Signed user JWT last seen via chat.identify({ token }) / data-user-token.
  // Guards against re-triggering re-auth when the same token arrives twice.
  const userTokenRef = useRef<string | null>(null);
  // Ensures session is created only once (on first open), not on every open/close.
  const sessionInitializedRef = useRef(false);
  // Guards the mount-time config load against React StrictMode's double effect.
  const configBootstrappedRef = useRef(false);
  // A/B variant assignment learned from the config fetch — reused by the
  // deferred session creation so it never refetches the config.
  const variantInfoRef = useRef<{ variant_id?: string; variant_name?: string } | undefined>(undefined);
  const configPromiseRef = useRef<Promise<{ variant_id?: string; variant_name?: string } | undefined> | null>(null);
  // Visitor JWT minted for this page view, reused by both phases below —
  // mirrors the chat widget's `readyRef` in useBootstrap.
  const authTokenRef = useRef<string | null>(null);
  const tokenPromiseRef = useRef<Promise<string | null> | null>(null);

  // Mint at most one visitor JWT: the mount-time config load and the deferred
  // session creation share whichever mint is already in flight. The promise ref
  // is cleared once settled so a failed mint can still be retried on open.
  const ensureAuthToken = useCallback((): Promise<string | null> => {
    if (authTokenRef.current) return Promise.resolve(authTokenRef.current);
    if (!tokenPromiseRef.current) {
      tokenPromiseRef.current = getAuthToken(clientId, resolveParentOrigin())
        .then((token) => {
          if (token) authTokenRef.current = token;
          return token;
        })
        .finally(() => { tokenPromiseRef.current = null; });
    }
    return tokenPromiseRef.current;
  }, [clientId, getAuthToken, resolveParentOrigin]);

  // Same deduplication for the config GET. `undefined` means the fetch failed
  // (fetchWidgetConfig swallows its own errors), so it stays retryable.
  const ensureWidgetConfig = useCallback((token: string) => {
    if (variantInfoRef.current) return Promise.resolve(variantInfoRef.current);
    if (!configPromiseRef.current) {
      configPromiseRef.current = fetchWidgetConfig(configId, token)
        .then((info) => {
          if (info) variantInfoRef.current = info;
          return info;
        })
        .finally(() => { configPromiseRef.current = null; });
    }
    return configPromiseRef.current;
  }, [configId, fetchWidgetConfig]);

  // Load the widget config on mount (auth token + config only — no session, so
  // page-load visitors who never interact still generate no DB records). The
  // collapsed search bar is themed and labelled from this config, so it cannot
  // wait for the first open the way the session does. Parity with the chat
  // widget, whose launcher is configured the same way (see useBootstrap).
  useEffect(() => {
    if (initialPreviewConfig) return;
    if (!clientId || !configId) return;
    if (configBootstrappedRef.current) return;
    configBootstrappedRef.current = true;
    (async () => {
      try {
        const token = await ensureAuthToken();
        if (!token) return;
        await ensureWidgetConfig(token);
      } catch (err) {
        // Non-fatal: the widget still opens, it just falls back to defaults
        // (and the open path retries both calls).
        logWarn('Docs widget config preload failed', { error: err });
      }
    })();
  }, [clientId, configId, initialPreviewConfig, ensureAuthToken, ensureWidgetConfig]);

  // Single source of truth for the iframe footprint. It runs on mount too —
  // handleOpenChange never fires for the initial state, and without an explicit
  // message the loader never learns the widget has no full-size collapsed UI and
  // falls back to an invisible 420x280 container that blocks clicks on the page
  // (and on the chat widget's teaser bubble) in the bottom-right corner.
  //   open              → full-screen overlay
  //   collapsed + bar   → bar-sized strip anchored bottom-center
  //   collapsed, no bar → hidden entirely
  useEffect(() => {
    if (initialPreviewConfig) return;
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
    const data = open
      ? { width: '100vw', height: '100vh' }
      : searchBarVisible
        ? {
            width: searchBarSize?.width || DOCS_SEARCH_BAR_SIZE.width,
            height: searchBarSize?.height || DOCS_SEARCH_BAR_SIZE.height,
            anchor: 'bottom-center',
          }
        : { width: 0, height: 0, hide: true };
    try {
      window.parent.postMessage({ type: 'WIDGET_RESIZE', data }, parentOrigin);
    } catch {
      // ignore — parent may be cross-origin/unreachable in some embed contexts
    }
  }, [open, searchBarVisible, searchBarSize?.width, searchBarSize?.height, initialPreviewConfig, parentOrigin]);

  const handleOpenChange = (newOpen: boolean) => {
    // The resize effect above follows this state change — no postMessage here,
    // so the open/collapsed/hidden footprints can never drift apart.
    setOpen(newOpen);
  };

  // Initialize session when the dialog is first opened. Deferred (not on mount)
  // so page-load visitors who never interact don't generate DB records.
  useEffect(() => {
    if (!open) return;
    if (sessionInitializedRef.current) return;
    if (initialPreviewConfig) return;
    if (clientId && agentId) {
      sessionInitializedRef.current = true;

      ensureAuthToken().then(async (token) => {
        if (token) {
          // Variant info comes from the config — joins the preload's in-flight
          // fetch (or its result) rather than issuing a second one.
          const variantInfo = await ensureWidgetConfig(token);

          const storedSession = helpersGetStoredSession(clientId, agentId);
          if (storedSession) {
            validateAndRestoreSession(storedSession.sessionId, token);
          } else {
            createSession(token, variantInfo);
          }
        } else {
          const message = authError || translate(localeRef.current, 'sessionOrAuthError');
          if (authError) {
            logError('Auth error', { authError });
          } else {
            logError('Auth token request returned null');
          }
          setError(message);
        }
      }).catch(err => {
        logError('Error getting auth token', { error: err });
        setError(translate(localeRef.current, 'sessionOrAuthError'));
      });
    } else {
      logWarn('Missing clientId or agentId');
    }
  }, [open, clientId, agentId, createSession, validateAndRestoreSession, ensureAuthToken, ensureWidgetConfig, initialPreviewConfig, authError]);

  // Preview mode only: apply live config updates pushed from the admin customize
  // panel via postMessage, so appearance edits update without reloading the
  // iframe (which would reset the widget to closed). Re-validated exactly as the
  // URL-based preview config, so no new trust surface.
  useEffect(() => {
    if (!initialPreviewConfig) return;
    const handler = (event: MessageEvent) => {
      const data = event?.data as { type?: string; config?: string } | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'COMPANIN_PREVIEW_CONFIG' || typeof data.config !== 'string') return;
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(data.config)));
        const { config: validatedConfig } = validateConfig(decoded, 'docs');
        setWidgetConfig({ status: 'success', data: validatedConfig });
      } catch {
        // ignore malformed preview config
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [initialPreviewConfig]);

  useEffect(() => {
    if (!initialPreviewConfig) return;
    window.parent.postMessage({ type: 'COMPANIN_PREVIEW_READY' }, '*');
  }, [initialPreviewConfig]);

  // Periodic check for expired sessions
  useEffect(() => {
    const checkSessionExpiry = () => {
      const stored = helpersGetStoredSession(clientId, agentId);
      if (!stored) return;

      // Keep in-memory state aligned when another tab refreshed the session,
      // but do not clear a working session just because storage is absent.
      if (sessionId && stored.sessionId && stored.sessionId !== sessionId) {
        setSessionId(stored.sessionId);
      }
    };

    const interval = setInterval(checkSessionExpiry, 60000);
    return () => clearInterval(interval);
  }, [sessionId, clientId, agentId]);

  // Apply hide_on_mobile from widget config for docs widget. Only the hide side
  // is posted: the container's visibility is otherwise driven by WIDGET_RESIZE,
  // and an unconditional WIDGET_SHOW would make the loader emit a spurious
  // "open" event (and a GA widget_open hit) on every page load now that the
  // config is fetched at mount rather than on first open.
  useEffect(() => {
    if (!widgetConfig) return;
    const ua = navigator.userAgent;
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
    if (!isMobileDevice || !widgetConfig?.data?.hide_on_mobile) return;

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'WIDGET_HIDE' }, parentOrigin);
      }
    } catch (e) {
      // ignore
    }
  }, [widgetConfig, parentOrigin]);

  // Listen for messages from parent to open/close dialog, toggle debug mode,
  // and handle debug utility commands (diagnostics, clear session, offline sim).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Origin gate: only act on messages from the trusted host page. Without
      // this any framing/sibling window could forge control messages
      // (clear-session, log-stream, diagnostics, identify). Mirrors the session
      // widget's isTrustedParentMessage gate.
      if (!isTrustedParentMessage(event, parentOrigin)) return;
      const { type, requestId, level, data: hostData } = (event.data || {}) as Record<string, unknown>;

      // Host-page commands (CompaninDocsWidget.*). Parsed with the chat
      // widget's grammar so both embeds accept the same payloads — a bare
      // string, { action: … }, or { text: … }.
      if (type === 'HOST_MESSAGE') {
        const command = parseHostMessageCommand(hostData);
        if (!command) return;

        if (command.kind === 'message') {
          hostActionsRef.current.sendText(command.text);
          return;
        }

        const payload = (command.data ?? {}) as Record<string, unknown>;
        switch (command.action) {
          case 'open':
            handleOpenChange(true);
            return;
          case 'close':
            handleOpenChange(false);
            return;
          case 'toggle':
            handleOpenChange(!open);
            return;
          case 'reset': {
            // Drop the conversation and forget the session so the next open
            // starts a fresh one. Mirrors the chat widget's reset().
            setMessages([]);
            setSessionId(null);
            setError(null);
            clearHostContext();
            sessionInitializedRef.current = false;
            helpersClearStoredSession(clientId, agentId);
            return;
          }
          case 'prefill': {
            const text = typeof payload.text === 'string' ? payload.text : '';
            if (text) hostActionsRef.current.prefill(text);
            return;
          }
          case 'context':
            mergeHostContext(payload);
            return;
          case 'setTheme': {
            const next = typeof payload.theme === 'string' ? payload.theme.trim().toLowerCase() : '';
            if (next === 'light' || next === 'dark' || next === 'system') {
              hostActionsRef.current.setThemeOverride(next);
            }
            return;
          }
          case 'conversion': {
            // A goal fired on the host page via trackConversion(). Attribute it
            // to the current session; silently no-op until one exists so an
            // early call never throws on the host page.
            const goalType = typeof payload.goal_type === 'string' ? payload.goal_type : '';
            if (sessionId && goalType) {
              trackConversion(
                sessionId,
                {
                  goal_type: goalType,
                  goal_label: typeof payload.goal_label === 'string' ? payload.goal_label : null,
                  value: typeof payload.value === 'number' ? payload.value : null,
                  currency: typeof payload.currency === 'string' ? payload.currency : null,
                  dedup_key: typeof payload.dedup_key === 'string' ? payload.dedup_key : null,
                  metadata: (payload.metadata && typeof payload.metadata === 'object')
                    ? (payload.metadata as Record<string, unknown>)
                    : null,
                },
                authTokenRef.current ?? undefined,
                embedHeaders,
              ).catch(() => {});
            }
            return;
          }
          case 'identify': {
            // Logged-in user handshake: the host page (or data-user-token) sends
            // a signed user JWT. Re-auth with it to get a user-claimed visitor
            // JWT, then restore that user's conversation across devices.
            // Non-fatal throughout — any failure leaves the widget anonymous.
            const userJwt = typeof payload.token === 'string' ? payload.token : null;
            if (userJwt && userJwt !== userTokenRef.current) {
              userTokenRef.current = userJwt;
              (async () => {
                try {
                  const newToken = await getAuthToken(clientId, resolveParentOrigin(), userJwt);
                  if (!newToken) return;
                  const resp = await fetch(API.sessionByUser(), {
                    headers: { Authorization: `Bearer ${newToken}`, ...embedHeaders },
                  });
                  if (resp.ok) {
                    const responsePayload = await resp.json();
                    const existingSessionId = responsePayload?.data?.session_id;
                    if (existingSessionId) {
                      await validateAndRestoreSession(existingSessionId, newToken);
                    }
                  }
                } catch { /* non-fatal — user continues with current session */ }
              })();
            }
            return;
          }
          default:
            return;
        }
      }

      // Storage consent, toggled from the host page. Revoking also wipes the
      // widget's persisted keys (see lib/sessionStorage), so the docs widget
      // honors it exactly like the chat widget.
      if (type === 'WIDGET_CONSENT_GRANT' || type === 'WIDGET_CONSENT_REVOKE') {
        (async () => {
          try {
            const mod = await import('../../../../lib/sessionStorage');
            if (type === 'WIDGET_CONSENT_GRANT') mod.grantStorageConsent();
            else mod.revokeStorageConsent();
          } catch { /* storage unavailable — nothing to consent to */ }
        })();
        return;
      }

      // The service worker asks every client to retry queued sends when the
      // network returns.
      if (type === 'FLUSH_QUEUE') {
        hostActionsRef.current.flushQueue();
        return;
      }

      if (type === 'OPEN_DOCS_DIALOG') {
        handleOpenChange(true);
      } else if (type === 'CLOSE_DOCS_DIALOG') {
        handleOpenChange(false);
      } else if (type === 'WIDGET_DEBUG_ENABLE') {
        enableDebug();
      } else if (type === 'WIDGET_DEBUG_DISABLE') {
        disableDebug();
      } else if (type === 'WIDGET_GET_DIAGNOSTICS') {
        const snap = {
          version: 'docs',
          sessionId,
          clientId,
          agentId,
          configId,
          debugActive: true,
          messageCount: messages?.length ?? 0,
          offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
          handshake: sessionId ? 'CONNECTED' : 'READY',
          lastError: error ?? null,
          widgetType: 'docs',
        };
        const replyOrigin = parentOrigin || resolveParentOrigin();
        if (window.parent && replyOrigin) {
          window.parent.postMessage({ type: 'WIDGET_DIAGNOSTICS_RESPONSE', requestId, data: snap }, replyOrigin);
        }
      } else if (type === 'WIDGET_CLEAR_SESSION') {
        let removed = 0;
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('companin-') || k.startsWith('companin_'))
            .forEach((k) => { localStorage.removeItem(k); removed += 1; });
        } catch { /* sandboxed */ }
        const ackOrigin = parentOrigin || resolveParentOrigin();
        if (window.parent && ackOrigin) {
          window.parent.postMessage({ type: 'WIDGET_CLEAR_SESSION_RESPONSE', requestId, removed }, ackOrigin);
        }
      } else if (type === 'WIDGET_SIMULATE_OFFLINE') {
        simulateOffline();
      } else if (type === 'WIDGET_RESTORE_ONLINE') {
        restoreOnline();
      } else if (type === 'WIDGET_SET_LOG_LEVEL' && typeof level === 'string') {
        setLogLevel(level as Parameters<typeof setLogLevel>[0]);
      } else if (type === 'WIDGET_ENABLE_LOG_STREAM') {
        enableLogStream(parentOrigin || resolveParentOrigin() || null);
      } else if (type === 'WIDGET_DISABLE_LOG_STREAM') {
        disableLogStream();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  // `open` is read by the toggle command; hostActions is read through a ref so
  // it doesn't churn this subscription.
  }, [handleOpenChange, open, sessionId, clientId, agentId, configId, messages, error, parentOrigin, getAuthToken, resolveParentOrigin, embedHeaders, validateAndRestoreSession, setMessages, setSessionId, setError]);

  return { handleOpenChange };
}
