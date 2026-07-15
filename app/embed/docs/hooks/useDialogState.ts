import React, { useEffect, useRef } from 'react'
import { API } from '../../../../lib/api'
import { validateConfig } from '../../../../lib/validateConfig'
import { enableDebug, disableDebug, simulateOffline, restoreOnline } from '../../../../src/components/DevOverlay'
import { setLogLevel, enableLogStream, disableLogStream } from '../../../../lib/logger'
import {
  getStoredSession as helpersGetStoredSession,
} from '../helpers'
import { isTrustedParentMessage } from '../DocsClient.utils'
import { MessageType } from '../DocsClient.types'

interface UseDialogStateParams {
  open: boolean;
  setOpen: (open: boolean) => void;
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
}

export function useDialogState({
  open,
  setOpen,
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
}: UseDialogStateParams) {
  // Signed user JWT last seen via chat.identify({ token }) / data-user-token.
  // Guards against re-triggering re-auth when the same token arrives twice.
  const userTokenRef = useRef<string | null>(null);
  // Ensures session is created only once (on first open), not on every open/close.
  const sessionInitializedRef = useRef(false);

  // handleOpenChange never fires for the initial state, so WIDGET_RESIZE is
  // never sent on mount. Send it once here: full-screen when starting open
  // (startOpen=true), and an explicit hide when starting closed — otherwise the
  // loader never learns the widget has no collapsed UI and falls back to an
  // invisible 420x280 container that blocks clicks on the page (and on the chat
  // widget's teaser bubble) in the bottom-right corner.
  useEffect(() => {
    if (initialPreviewConfig) return;
    if (typeof window === 'undefined' || !window.parent || window.parent === window) return;
    try {
      window.parent.postMessage(
        open
          ? { type: 'WIDGET_RESIZE', data: { width: '100vw', height: '100vh' } }
          : { type: 'WIDGET_RESIZE', data: { width: 0, height: 0, hide: true } },
        parentOrigin,
      );
    } catch {
      // ignore — parent may be cross-origin/unreachable in some embed contexts
    }
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);

    // Send resize message to parent
    if (typeof window !== 'undefined' && window.parent) {
      try {
        if (newOpen) {
          // Full screen when dialog opens
          window.parent.postMessage({
            type: 'WIDGET_RESIZE',
            data: { width: '100vw', height: '100vh' }
          }, parentOrigin);
        } else {
          // Back to original size and position when dialog closes
          window.parent.postMessage({
            type: 'WIDGET_RESIZE',
            data: { width: 0, height: 0, hide: true }
          }, parentOrigin);
        }
      } catch {
        // ignore — parent may be cross-origin/unreachable in some embed contexts
      }
    }
  };

  // Initialize session when the dialog is first opened. Deferred (not on mount)
  // so page-load visitors who never interact don't generate DB records.
  useEffect(() => {
    if (!open) return;
    if (sessionInitializedRef.current) return;
    if (initialPreviewConfig) return;
    if (clientId && agentId) {
      sessionInitializedRef.current = true;
      const detectedParentOrigin = resolveParentOrigin();

      getAuthToken(clientId, detectedParentOrigin).then(async (token) => {
        if (token) {
          // Fetch widget config first so variant info is available for session creation
          const variantInfo = await fetchWidgetConfig(configId, token);

          const storedSession = helpersGetStoredSession(clientId, agentId);
          if (storedSession) {
            validateAndRestoreSession(storedSession.sessionId, token);
          } else {
            createSession(token, variantInfo);
          }
        } else {
          const message = authError || 'Failed to authenticate';
          if (authError) {
            console.error('Auth error:', authError);
          } else {
            console.error('Auth token request returned null');
          }
          setError(message);
        }
      }).catch(err => {
        console.error('Error getting auth token:', err);
        setError('Failed to authenticate');
      });
    } else {
      console.warn('Missing clientId or agentId');
    }
  }, [open, clientId, agentId, configId, createSession, validateAndRestoreSession, fetchWidgetConfig, getAuthToken, initialPreviewConfig, resolveParentOrigin, authError]);

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

  // Apply hide_on_mobile from widget config for docs widget
  useEffect(() => {
    if (!widgetConfig) return;
    const ua = navigator.userAgent;
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
    const hideOnMobile = Boolean(widgetConfig?.data?.hide_on_mobile);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: hideOnMobile && isMobileDevice ? 'WIDGET_HIDE' : 'WIDGET_SHOW' },
          parentOrigin
        );
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

      // Logged-in user handshake: the host page (or data-user-token) sends a
      // signed user JWT via chat.identify({ token }). Re-auth with the token to
      // get a user-claimed visitor JWT, then look up and restore the user's
      // existing conversation across devices/browsers. Non-fatal throughout —
      // any failure leaves the widget running anonymously.
      if (type === 'HOST_MESSAGE') {
        const action = (hostData as Record<string, unknown> | undefined)?.action;
        if (action === 'identify') {
          const userJwt = typeof (hostData as Record<string, unknown>)?.token === 'string'
            ? (hostData as Record<string, string>).token
            : null;
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
                  const payload = await resp.json();
                  const existingSessionId = payload?.data?.session_id;
                  if (existingSessionId) {
                    await validateAndRestoreSession(existingSessionId, newToken);
                  }
                }
              } catch { /* non-fatal — user continues with current session */ }
            })();
          }
        }
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
  }, [handleOpenChange, sessionId, clientId, agentId, configId, messages, error, parentOrigin, getAuthToken, resolveParentOrigin, embedHeaders, validateAndRestoreSession]);

  return { handleOpenChange };
}
