import React, { useCallback } from 'react'
import { API } from '../../../../lib/api'
import { TIMEOUTS } from '../../../../lib/constants'
import { t as translate } from '../../../../lib/i18n'
import {
  getSessionStorageKey,
  getVisitorId as helpersGetVisitorId,
  storeSession as helpersStoreSession,
} from '../helpers'
import { fetchWithTimeout } from '../resilientFetch'
import { MessageType } from '../DocsClient.types'
import { initialMessages } from '../DocsClient.constants'

interface UseSessionManagementParams {
  agentId: string;
  activeLocale: string;
  clientId: string;
  initialParentOrigin?: string;
  embedHeaders: Record<string, string>;
  setSessionId: (id: string | null) => void;
  setError: (err: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>;
  setIsInitialLoad: (val: boolean) => void;
}

export function useSessionManagement({
  agentId,
  activeLocale,
  clientId,
  initialParentOrigin,
  embedHeaders,
  setSessionId,
  setError,
  setMessages,
  setIsInitialLoad,
}: UseSessionManagementParams) {
  // Load session messages
  async function loadSessionMessages(sessionId: string, token: string, isNewSession = false) {
    if (!sessionId) {
      console.error('Skipping loadSessionMessages: missing sessionId');
      return;
    }
    try {
      const response = await fetchWithTimeout(API.sessionMessages(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      }, TIMEOUTS.SESSION_CREATE);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          const loadedMessages: MessageType[] = data.data.messages
            .filter((msg: any) => {
              if (msg.sender === 'assistant') {
                const userMessages = data.data.messages.filter((m: any) => m.sender === 'user');
                return userMessages.length > 0;
              }
              return true;
            })
            .map((msg: any) => ({
              key: msg.id,
              from: msg.sender === 'assistant' ? 'agent' : msg.sender as 'user' | 'agent',
              sources: msg.sources || [],
              versions: [{
                id: msg.id,
                content: msg.content
              }]
            }));
          setMessages(loadedMessages.length > 0 ? loadedMessages : initialMessages);
          setIsInitialLoad(false);
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }

  // Create session
  const createSession = useCallback(async (token: string, variantInfo?: { variant_id?: string; variant_name?: string }) => {
    try {
      const visitorId = helpersGetVisitorId(clientId);

            const requestBody: Record<string, unknown> = {
        agent_id: agentId,
        visitor_id: visitorId,
        locale: activeLocale,
        ...(variantInfo?.variant_id ? { metadata: { variant_id: variantInfo.variant_id, variant_name: variantInfo.variant_name } } : {}),
            };

      const response = await fetchWithTimeout(API.sessions(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
        body: JSON.stringify(requestBody),
      }, TIMEOUTS.SESSION_CREATE);

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSessionId(data.data.session_id);
        setError(null);
        // Store session data in localStorage
        if (data.data.expires_at) {
          helpersStoreSession(clientId, agentId, data.data.session_id, data.data.expires_at);
        }
        // Load messages after session creation
        await loadSessionMessages(data.data.session_id, token, true);
      } else {
        // Server-provided `detail` (rate limits, config issues) is already meant
        // to be user-facing; fall back to a localized generic when it's absent.
        const errorMsg = data.detail || translate(activeLocale, 'failedToCreateSession');
        console.error('Session creation failed:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      // Network drop / timeout — show a friendly, localized message rather than
      // a raw "Network error" string. The session auto-recovers on the next
      // open or when connectivity returns (useDocsConnectivity).
      console.error('Session creation error:', err);
      setError(translate(activeLocale, 'networkErrorConnect'));
    }
  }, [agentId, activeLocale, clientId, initialParentOrigin]);

  // Validate and restore existing session
  const validateAndRestoreSession = useCallback(async (sessionId: string, token: string) => {
    if (!sessionId) {
      console.error('validateAndRestoreSession called with empty sessionId');
      return;
    }
    try {
      const response = await fetchWithTimeout(API.sessionMessages(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...embedHeaders,
        },
      }, TIMEOUTS.SESSION_CREATE);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setSessionId(sessionId);
          setError(null);
          // Load messages
          const loadedMessages: MessageType[] = data.data.messages
            .filter((msg: any) => {
              if (msg.sender === 'assistant') {
                const userMessages = data.data.messages.filter((m: any) => m.sender === 'user');
                return userMessages.length > 0;
              }
              return true;
            })
            .map((msg: any) => ({
              key: msg.id,
              from: msg.sender === 'assistant' ? 'agent' : msg.sender as 'user' | 'agent',
              sources: msg.sources || [],
              versions: [{
                id: msg.id,
                content: msg.content
              }]
            }));
          setMessages(loadedMessages.length > 0 ? loadedMessages : initialMessages);
          setIsInitialLoad(false);
        } else {
          localStorage.removeItem(getSessionStorageKey(clientId, agentId));
          createSession(token);
        }
      } else {
        localStorage.removeItem(getSessionStorageKey(clientId, agentId));
        createSession(token);
      }
    } catch (err) {
      console.error('Session validation error:', err);
      localStorage.removeItem(getSessionStorageKey(clientId, agentId));
      createSession(token);
    }
  }, [createSession]);

  return { createSession, validateAndRestoreSession, loadSessionMessages };
}
