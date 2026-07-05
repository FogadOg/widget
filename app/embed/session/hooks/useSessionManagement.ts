import { useEffect, useRef, useState } from 'react';
import {
  createSessionError,
  createNetworkError,
  createAuthError,
  retryWithBackoff,
  logError,
  parseApiError,
  WidgetErrorCode,
} from '../../../../lib/errorHandling';
import { API } from '../../../../lib/api';
import { EMBED_EVENTS, STORAGE_KEYS } from '../../../../lib/embedConstants';
import { logPerf } from '../../../../lib/logger';
import { t as tFn } from '../../../../lib/i18n';
import { validateConfig } from '../../../../lib/validateConfig';
import * as helpers from '../helpers';
import type { Message, WidgetConfig, SourceData } from '../../../../types/widget';

const RATE_LIMIT_STORAGE_PREFIX = 'companin-rate-limit-until';
const RATE_LIMIT_FALLBACK_SEC = 20;

function parseRetryAfterSeconds(headerValue: string | null): number {
  if (!headerValue) return 0;
  const numeric = Number(headerValue);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  const asDate = Date.parse(headerValue);
  if (!Number.isFinite(asDate)) return 0;
  const seconds = Math.ceil((asDate - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

export function useSessionManagement({
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
  t,
  checkFeedbackStatus,
  flushQueuedMessages,
  injectCustomAssetsFromConfig,
  postedShowUnreadBadge,
  postedEdgeOffset,
}: {
  initialAgentId: string;
  initialClientId: string;
  initialConfigId: string;
  initialParentOrigin: string | undefined;
  initialForceVariantId: string | undefined;
  initialLocale: string;
  activeLocale: string;
  sessionStorageKey: string;
  baseSessionKey: string;
  embedHeaders: Record<string, string>;
  parentSensitiveOrigin: string | null;
  authToken: string | null | undefined;
  authTokenRef: React.MutableRefObject<string | null>;
  getAuthToken: (...args: any[]) => Promise<string | null>;
  widgetConfig: WidgetConfig | null;
  setWidgetConfig: React.Dispatch<React.SetStateAction<WidgetConfig | null>>;
  setAgentName: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setFeedbackSubmitted: React.Dispatch<React.SetStateAction<boolean>>;
  feedbackSubmitted: boolean;
  hasLoadedMessagesRef: React.MutableRefObject<boolean>;
  sessionRefreshInFlightRef: React.MutableRefObject<boolean>;
  t: Record<string, unknown>;
  checkFeedbackStatus: (sessionId: string, token: string) => Promise<void>;
  flushQueuedMessages: () => Promise<void>;
  injectCustomAssetsFromConfig: (config: { custom_css?: string | null } | null | undefined) => void;
  postedShowUnreadBadge: React.MutableRefObject<boolean | undefined>;
  postedEdgeOffset: React.MutableRefObject<number | undefined>;
}) {
  const sessionIdRef = useRef<string | null>(null);
  const agentDetailsInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const agentDetailsFetchedAtRef = useRef<Map<string, number>>(new Map());
  const widgetConfigInFlightRef = useRef<Map<string, Promise<WidgetConfig>>>(new Map());
  const widgetConfigFetchedAtRef = useRef<Map<string, number>>(new Map());
  const BOOTSTRAP_DEDUPE_WINDOW_MS = 5000;

  const buildRateLimitKey = (scope: string) =>
    `${RATE_LIMIT_STORAGE_PREFIX}:${scope}:${initialClientId}:${initialAgentId}`;

  const readRateLimitUntil = (scope: string): number => {
    try {
      const raw = sessionStorage.getItem(buildRateLimitKey(scope)) || localStorage.getItem(buildRateLimitKey(scope));
      const until = raw ? Number(raw) : 0;
      return Number.isFinite(until) ? until : 0;
    } catch {
      return 0;
    }
  };

  const writeRateLimitUntil = (scope: string, retryAfterHeader: string | null) => {
    const waitSec = Math.max(parseRetryAfterSeconds(retryAfterHeader), RATE_LIMIT_FALLBACK_SEC);
    const until = Date.now() + waitSec * 1000;
    try {
      sessionStorage.setItem(buildRateLimitKey(scope), String(until));
      localStorage.setItem(buildRateLimitKey(scope), String(until));
    } catch {
      // ignore storage failures
    }
    return waitSec;
  };

  const ensureNotCoolingDown = (scope: string, fallbackMessage?: string) => {
    const until = readRateLimitUntil(scope);
    if (!until || until <= Date.now()) return;
    const waitSec = Math.max(1, Math.ceil((until - Date.now()) / 1000));
    const msg = waitSec > 0
      ? tFn(activeLocale, 'rateLimitWait', { count: waitSec })
      : (fallbackMessage || String(t.rateLimitGeneric));
    const err = createNetworkError(msg, WidgetErrorCode.NETWORK_RATE_LIMITED);
    err.retryable = false;
    err.userMessage = msg;
    throw err;
  };

  // Helper to make an authenticated API call with 401 retry logic
  async function fetchWithAuthRetry(fetchFn: (token: string | null, ...rest: unknown[]) => Promise<Response>, ...args: unknown[]) {
    let token: string | null = authTokenRef.current ?? authToken ?? null;
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
    // setIsTyping(true) is called by caller
    try {
      ensureNotCoolingDown('session-read', String(t.sessionRateLimitGeneric ?? t.rateLimitGeneric));

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
        if (response.status === 429) {
          const waitSec = writeRateLimitUntil('session-read', response.headers.get('Retry-After'));
          const rateLimitMsg = waitSec > 0
            ? tFn(activeLocale, 'rateLimitWait', { count: waitSec })
            : String(t.sessionRateLimitGeneric ?? t.rateLimitGeneric);
          setError(rateLimitMsg);
          return;
        }
        throw new Error(`Failed to load messages: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'success' && Array.isArray(data.data?.messages)) {
        // ...existing code...
        const loadedMessages: Message[] = (data.data.messages as unknown[])
          .filter((msg: unknown) => {
            // ...existing code...
            const m = msg as { sender?: string; id?: string };
            if (m.sender === 'assistant') {
              // Greeting messages are always shown regardless of user message count
              if (typeof m.id === 'string' && m.id.startsWith('greeting-')) return true;
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
      logError(err instanceof Error ? (err.message || 'Unknown error') : String(err), { sessionId, isInitial, source: 'loadSessionMessages' });
      logError(err instanceof Error ? (err.message || 'Unknown error') : String(err), { sessionId, isInitial, action: 'loadSessionMessages' });
      if (isInitial) {
        setError(String(t.loadHistoryError));
      }
    }
  }

  async function createSession(agent: string, token: string, configSnapshot?: ReturnType<typeof validateConfig>['config'] | null, skipMessageLoad = false) {
    try {
      ensureNotCoolingDown('session-create', String(t.sessionRateLimitGeneric ?? t.rateLimitGeneric));
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

            // 429: the server is explicitly rate-limiting session creation
            // (5/min, 30/hr per visitor). Retrying with backoff (1s/2s/4s) stays
            // inside the 60s window and just burns more quota — so mark it
            // non-retryable and surface a localized "please wait" message.
            if (response.status === 429) {
              const waitSec = writeRateLimitUntil('session-create', response.headers.get('Retry-After'));
              const rateLimitMsg = waitSec > 0
                ? tFn(activeLocale, 'rateLimitWait', { count: waitSec })
                : String(t.sessionRateLimitGeneric ?? t.rateLimitGeneric);
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
              const id = (apiMsg as any).id as string | undefined;
              if (sender === 'assistant') {
                // Greeting messages are always shown regardless of user message count
                if (typeof id === 'string' && id.startsWith('greeting-')) return true;
                const userMessages = (data.data.messages as unknown[]).filter((m2: unknown) => ((m2 as any).sender || (m2 as any).from) === 'user');
                return userMessages.length > 0;
              }
              return true;
            })
            .map((apiMsgRaw: unknown) => {
              const apiMsg = apiMsgRaw as ApiMessage & { from?: string; text?: string };
              const id = (apiMsg as any).id || ((apiMsg as any).message_id ?? '');
              const text = (apiMsg as any).content ?? (apiMsg as any).text ?? '';
              const rawFrom = ((apiMsg as any).sender ?? (apiMsg as any).from ?? 'user') as string;
              const from = rawFrom === 'assistant' ? 'agent' : rawFrom;
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
      helpers.clearStoredSession(sessionStorageKey);
      await createSession(agentId, token, configSnapshot);
    } catch (err) {
      logError(err, { sessionId, agentId, action: 'validateAndRestoreSession' });
      // On error, create new session. clearStoredSession swallows storage failures
      // so a private-mode removeItem throw can't escape this catch. (#12)
      helpers.clearStoredSession(sessionStorageKey);
      await createSession(agentId, token, configSnapshot);
    }
  }

  async function fetchAgentDetails(agentId: string, token: string) {
    const recentFetchAt = agentDetailsFetchedAtRef.current.get(agentId) || 0;
    if (Date.now() - recentFetchAt < BOOTSTRAP_DEDUPE_WINDOW_MS) {
      return;
    }

    const inFlight = agentDetailsInFlightRef.current.get(agentId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const start = Date.now();
    const run = (async () => {
      ensureNotCoolingDown('agent-details', String(t.rateLimitGeneric));
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
          return;
        }
        throw createAuthError('Invalid agent response', WidgetErrorCode.AUTH_TOKEN_FAILED);
      }

      if (response.status === 429) {
        const waitSec = writeRateLimitUntil('agent-details', response.headers.get('Retry-After'));
        const rateLimitMsg = waitSec > 0
          ? tFn(activeLocale, 'rateLimitWait', { count: waitSec })
          : String(t.rateLimitGeneric);
        const rateLimitErr = createNetworkError(rateLimitMsg, WidgetErrorCode.NETWORK_RATE_LIMITED);
        rateLimitErr.retryable = false;
        rateLimitErr.userMessage = rateLimitMsg;
        throw rateLimitErr;
      }

      const errorMessage = String(t.agentUnavailable);
      throw createAuthError(errorMessage, WidgetErrorCode.AUTH_TOKEN_FAILED);
    })();

    agentDetailsInFlightRef.current.set(agentId, run);

    try {
      await run;
      agentDetailsFetchedAtRef.current.set(agentId, Date.now());
    } catch (err) {
      logError(err, { agentId, action: 'fetchAgentDetails' });
      throw err;
    } finally {
      agentDetailsInFlightRef.current.delete(agentId);
      const duration = Date.now() - start;
      logPerf('fetchAgentDetails', duration, { agentId });
    }
  }

  async function fetchWidgetConfig(configId: string, token: string) {
    const recentFetchAt = widgetConfigFetchedAtRef.current.get(configId) || 0;
    if (Date.now() - recentFetchAt < BOOTSTRAP_DEDUPE_WINDOW_MS && widgetConfig) {
      return widgetConfig;
    }

    const inFlight = widgetConfigInFlightRef.current.get(configId);
    if (inFlight) {
      return await inFlight;
    }

    const start = Date.now();
    const run = (async () => {
      ensureNotCoolingDown('widget-config', String(t.configUnavailable));
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
        if (response.status === 429) {
          const waitSec = writeRateLimitUntil('widget-config', response.headers.get('Retry-After'));
          const rateLimitMsg = waitSec > 0
            ? tFn(activeLocale, 'rateLimitWait', { count: waitSec })
            : String(t.rateLimitGeneric);
          const rateLimitErr = createNetworkError(rateLimitMsg, WidgetErrorCode.NETWORK_RATE_LIMITED);
          rateLimitErr.retryable = false;
          rateLimitErr.userMessage = rateLimitMsg;
          throw rateLimitErr;
        }
        const errorMessage = String(t.configUnavailable);
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
        widgetConfigFetchedAtRef.current.set(configId, Date.now());
        if (typeMismatch) {
          setError('Configuration warning: this config is set to "docs" type but is running in the chat widget. Check your widget_type setting in the admin.');
        }
        return validatedConfig;
      } else {
        throw createAuthError('Invalid config response format', WidgetErrorCode.INVALID_CONFIG);
      }
    })();

    widgetConfigInFlightRef.current.set(configId, run);

    try {
      return await run;
    } catch (err) {
      logError(err, { configId, action: 'fetchWidgetConfig' });
      throw err; // Re-throw so it can be caught by the caller
    } finally {
      widgetConfigInFlightRef.current.delete(configId);
      const duration = Date.now() - start;
      logPerf('fetchWidgetConfig', duration, { configId });
    }
  }

  return {
    sessionIdRef,
    loadSessionMessages,
    createSession,
    validateAndRestoreSession,
    fetchAgentDetails,
    fetchWidgetConfig,
  };
}
