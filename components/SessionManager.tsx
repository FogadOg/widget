'use client';



import { useEffect, useCallback } from 'react';
import { createSessionError, retryWithBackoff, parseApiError, WidgetErrorCode, createNetworkError } from 'lib/errorHandling';
import { embedOriginHeader } from 'lib/api';
import { logError } from 'lib/logger';
import { TIMEOUTS, STORAGE_PREFIX } from 'lib/constants';
import { API } from 'lib/api';
import { getOrCreateVisitorId, getStoredSessionByKey, storeSessionByKey } from 'lib/sessionStorage';
import type { Message } from 'types/widget';

type SessionManagerProps = {
  assistantId: string;
  authToken: string;
  locale: string;
  onSessionCreated: (sessionId: string, expiresAt: string) => void;
  onSessionError: (error: string) => void;
  onMessagesLoaded: (messages: Message[]) => void;
};

export default function SessionManager({
  assistantId,
  authToken,
  locale,
  onSessionCreated,
  onSessionError,
  onMessagesLoaded
}: SessionManagerProps) {
  const storageKey = `${STORAGE_PREFIX}session-${assistantId}`;
  const visitorKey = `${STORAGE_PREFIX}visitor-${assistantId}`;

  // Helper function to get stored session data
  const getStoredSession = useCallback(() => {
    return getStoredSessionByKey(storageKey);
  }, [storageKey]);

  // Helper function to store session data
  const storeSession = useCallback((sessionId: string, expiresAt: string) => {
    storeSessionByKey(storageKey, sessionId, expiresAt);
  }, [storageKey]);

  // Helper function to get visitor ID
  const getVisitorId = useCallback(() => {
    return getOrCreateVisitorId(visitorKey, 'widget');
  }, [visitorKey]);

  async function loadSessionMessages(sessionId: string) {
    if (!sessionId) {
      logError('Skipping loadSessionMessages: missing sessionId', { action: 'loadSessionMessages' });
      return;
    }
    try {
      const response = await fetch(API.sessionMessages(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          ...embedOriginHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load messages: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'success' && Array.isArray(data.data?.messages)) {
        // Convert API messages to widget message format
        const loadedMessages: Message[] = data.data.messages
          .filter((msg: any) => {
            // Filter out assistant greeting messages
            if (msg.sender === 'assistant') {
              const userMessages = data.data.messages.filter((m: any) => m.sender === 'user');
              return userMessages.length > 0;
            }
            return true;
          })
          .map((msg: any) => ({
            id: msg.id,
            text: msg.content,
            from: msg.sender as 'user' | 'assistant',
            timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
            sources: msg.sources || [],
          }));

        onMessagesLoaded(loadedMessages);
      } else {
        throw new Error('Invalid messages response format');
      }
    } catch (err: any) {
      try {
        // Surface full error object in dev console for easier debugging
        // without changing external logging behavior.
        console.error('loadSessionMessages error', err, { sessionId, action: 'loadSessionMessages' });
      } catch {}

      logError(err instanceof Error ? (err.message || 'Unknown error') : String(err), { sessionId, action: 'loadSessionMessages' });
      // Non-critical error for non-initial loads
    }
  }

  const createSession = useCallback(async () => {
    try {
      const visitorId = getVisitorId();

      const sessionData = await retryWithBackoff(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.SESSION_CREATE);

          try {
            const response = await fetch(API.sessions(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                ...embedOriginHeader(),
              },
              body: JSON.stringify({
                assistant_id: assistantId,
                visitor_id: visitorId,
                locale: locale,
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
          } catch (fetchError: any) {
            clearTimeout(timeoutId);

            if (fetchError.name === 'AbortError') {
              throw createNetworkError(
                'Session creation timed out',
                WidgetErrorCode.NETWORK_TIMEOUT
              );
            }

            throw fetchError;
          }
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          onRetry: (attempt, error) => {
            logError(error instanceof Error ? error.message : String(error), { assistantId, attempt, action: 'createSession' });
          },
        }
      );

      onSessionCreated(sessionData.session_id, sessionData.expires_at);

      // Store session data in localStorage
      if (sessionData.expires_at) {
        storeSession(sessionData.session_id, sessionData.expires_at);
      }

      // Load messages after session creation
      await loadSessionMessages(sessionData.session_id);
    } catch (err: any) {
      const errorMessage = err.userMessage || 'Failed to create session';
      onSessionError(errorMessage);
      logError(err instanceof Error ? err.message : String(err), { assistantId, action: 'createSession' });
    }

  }, [assistantId, authToken, locale, getVisitorId, storeSession, onSessionCreated, onSessionError]);

  const validateAndRestoreSession = useCallback(async (storedSessionId: string) => {
    try {
      const response = await fetch(API.sessionMessages(storedSessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          ...embedOriginHeader(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          // Session is valid, use it
          onSessionCreated(storedSessionId, '');

          // Load messages
          const loadedMessages: Message[] = data.data.messages
            .filter((msg: any) => {
              // Filter out assistant greeting messages
              if (msg.sender === 'assistant') {
                const userMessages = data.data.messages.filter((m: any) => m.sender === 'user');
                return userMessages.length > 0;
              }
              return true;
            })
            .map((msg: any) => ({
              id: msg.id,
              text: msg.content,
              from: msg.sender as 'user' | 'assistant',
              timestamp: msg.created_at ? new Date(msg.created_at).getTime() : Date.now()
            }));

          onMessagesLoaded(loadedMessages);
          return;
        }
      }

      // Session invalid or not found, create new one
      logError('Session validation failed', {
        sessionId: storedSessionId,
        assistantId,
        status: response.status
      });
      localStorage.removeItem(storageKey);
      await createSession();
    } catch (err) {
      logError(err instanceof Error ? err.message : String(err), { sessionId: storedSessionId, assistantId, action: 'validateAndRestoreSession' });
      // On error, create new session
      localStorage.removeItem(storageKey);
      await createSession();
    }
  }, [assistantId, authToken, createSession, onSessionCreated, onMessagesLoaded, storageKey]);

  // Initialize session on mount
  useEffect(() => {
    if (authToken && assistantId) {
      // Try to restore existing session first
      const storedSession = getStoredSession();
      if (storedSession) {
        validateAndRestoreSession(storedSession.sessionId);
      } else {
        createSession();
      }
    }
  }, [authToken, assistantId, getStoredSession, validateAndRestoreSession, createSession]);

  return null; // This component doesn't render anything
}

// Use shared `createNetworkError` from `lib/errorHandling` to ensure
// consistent error shape and retry behavior across components.