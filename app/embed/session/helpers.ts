import { API } from '../../../lib/api';
import { logError } from '../../../lib/errorHandling';
import { getOrCreateVisitorId, getStoredSessionByKey, storeSessionByKey } from '../../../lib/sessionStorage';
import { STORAGE_PREFIX } from '../../../lib/constants';
import type { Message, SourceData } from '../../../types/widget';

/**
 * Storage keys for widget instances.
 * The base `sessionStorageKey` keeps the legacy two-argument signature used
 * by most callers and unit tests. Use `sessionStorageKeyForLocale` when a
 * locale-specific key is required to avoid cross-locale session bleed.
 */
export function sessionStorageKey(clientId: string, agentId: string) {
  return `${STORAGE_PREFIX}session-${clientId}-${agentId}`;
}

export function sessionStorageKeyForLocale(clientId: string, agentId: string, locale?: string) {
  const localeSuffix = locale ? `-${locale}` : '';
  return `${STORAGE_PREFIX}session-${clientId}-${agentId}${localeSuffix}`;
}

export function unreadStorageKey(clientId: string, agentId: string) {
  return `${STORAGE_PREFIX}unread-${clientId}-${agentId}`;
}

export function lastReadStorageKey(clientId: string, agentId: string) {
  return `${STORAGE_PREFIX}lastread-${clientId}-${agentId}`;
}

export function flowResponsesStorageKey(sessionId: string) {
  return `${STORAGE_PREFIX}flow-${sessionId}`;
}

export function localMessagesStorageKey(sessionId: string) {
  return `${STORAGE_PREFIX}local-msgs-${sessionId}`;
}

/** Stores the assigned A/B variant ID so it persists across page reloads. */
export function variantStorageKey(clientId: string, configId: string) {
  return `${STORAGE_PREFIX}variant-${clientId}-${configId}`;
}

export function getVisitorId(clientId: string) {
  const visitorKey = `${STORAGE_PREFIX}visitor-${clientId}`;
  return getOrCreateVisitorId(visitorKey, 'widget');
}

export function getPageContext(
  windowObj: Window = window,
  documentObj: Document = document
) {
  const safeLocation = () => {
    try {
      return {
        href: windowObj.location.href,
        pathname: windowObj.location.pathname,
      };
    } catch {
      return {
        href: '',
        pathname: '',
      };
    }
  };

  try {
    const isEmbedded = (() => {
      try {
        return windowObj.top !== windowObj.self;
      } catch {
        return true;
      }
    })();

    if (isEmbedded && documentObj.referrer) {
      try {
        const referrerUrl = new URL(documentObj.referrer);
        return {
          url: documentObj.referrer,
          pathname: referrerUrl.pathname,
          title: null,
          referrer: documentObj.referrer,
        };
      } catch {
        return {
          url: documentObj.referrer,
          pathname: null,
          title: null,
          referrer: documentObj.referrer,
        };
      }
    }

    return {
      url: safeLocation().href,
      pathname: safeLocation().pathname,
      title: documentObj.title,
      referrer: documentObj.referrer || null,
    };
  } catch {
    const location = safeLocation();
    return {
      url: location.href,
      pathname: location.pathname,
      title: 'Unknown Page',
      referrer: null,
    };
  }
}

export function getStoredSession(sessionStorageKey: string) {
  return getStoredSessionByKey(sessionStorageKey);
}

export function storeSession(sessionStorageKey: string, sessionId: string, expiresAt: string) {
  storeSessionByKey(sessionStorageKey, sessionId, expiresAt);
}

export async function loadSessionMessages(
  sessionId: string,
  token?: string | null,
  setMessages?: ((msgs: Message[]) => void) | boolean
) {
  // Defensive guard: avoid making requests when sessionId is missing/null.
  if (!sessionId) {
    logError(new Error('loadSessionMessages called with empty sessionId'), { action: 'loadSessionMessages', sessionId });
    return;
  }
  const setMessagesFn = typeof setMessages === 'function' ? setMessages : undefined;
  const hasCallback = !!setMessagesFn;
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(API.sessionMessages(sessionId), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to load messages: ${response.status}`);
    }

    const data = await response.json();
    if (data.status === 'success' && Array.isArray(data.data?.messages)) {
      type ApiMessage = {
        id: string;
        content: string;
        sender: 'user' | 'assistant';
        created_at?: string;
        sources?: unknown[];
      };
      const loaded: Message[] = (data.data.messages as unknown[]).map((msg: unknown) => {
        const m = msg as ApiMessage;
        return {
          id: m.id,
          text: m.content,
          from: m.sender === 'assistant' ? 'agent' : m.sender,
          timestamp: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
          sources: (m.sources as SourceData[]) || [],
        };
      });
      if (setMessagesFn) setMessagesFn(loaded);
    }
  } catch (err) {
    // If a callback was provided, log and swallow the error so callers that
    // just requested messages are not forced to handle the exception. If no
    // callback was given (typical for programmatic reloads after submit),
    // rethrow and let the caller (e.g. `handleSubmit`) log with the correct
    // contextual information.
    const e = err as Error;
    if (!hasCallback) {
      throw err;
    }

    logError(e, { action: 'loadSessionMessages', sessionId, isInitial: false });
  }
}
