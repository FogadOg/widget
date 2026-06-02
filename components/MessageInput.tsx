'use client';

 

import { useState } from 'react';
// Small id generator to avoid depending on ESM-only `nanoid` in tests
const generateId = (size = 9) => {
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < size; i++) id += alpha[Math.floor(Math.random() * alpha.length)];
  return id;
};
import { createNetworkError, retryWithBackoff, parseApiError, WidgetErrorCode, createSessionError } from 'lib/errorHandling';
import { logError, logPerf } from 'lib/logger';
import { validateMessageInput } from 'lib/validation';
import { TIMEOUTS } from 'lib/constants';
import { checkAndConsume } from 'lib/rateLimiter';
import { API } from 'lib/api';
import { t as translate } from 'lib/i18n';
import type { Message, PageContext } from 'types/widget';

const nowMs = () => Date.now();
const nowPerf = () => (typeof performance !== 'undefined' ? performance.now() : nowMs());

type MessageInputProps = {
  sessionId: string | null;
  authToken: string;
  locale: string;
  onMessageSent: (message: Message) => void;
  onMessageFailed?: (tempId: string) => void;
  onError: (error: string) => void;
  onTypingStart: () => void;
  onTypingEnd: () => void;
  getPageContext: () => PageContext;
  disabled?: boolean;
};

export default function MessageInput({
  sessionId,
  authToken,
  locale,
  onMessageSent,
  onError,
  onTypingStart,
  onTypingEnd,
  getPageContext,
  onMessageFailed,
  disabled = false
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    const start = nowPerf();
    e.preventDefault();
    const message = input.trim();

    // Validate and sanitize input
    const validation = validateMessageInput(message);
    if (!validation.isValid) {
      onError(validation.error || 'Invalid message');
      return;
    }

    const sanitizedMessage = validation.sanitized;

    // Check if we have a session and auth token
    if (!sessionId || !authToken) {
      const errorMsg = 'Session or authentication error';
      onError(errorMsg);
      logError('Missing session or auth token', {
        hasSession: !!sessionId,
        hasAuth: !!authToken
      });
      return;
    }

    // Client-side rate limiting
    const rl = checkAndConsume(sessionId);
    if (!rl.allowed) {
      const secs = Math.ceil((rl.retryAfterMs || 0) / 1000) || 1;
      onError(`You're sending messages too quickly. Try again in ${secs} second${secs > 1 ? 's' : ''}.`);
      return;
    }

    // Immediately add the user message to the UI
    const userMessage: Message = {
      id: `temp-${generateId(9)}`,
      text: sanitizedMessage,
      from: 'user',
      timestamp: nowMs()
    };
    onMessageSent(userMessage);

    setInput('');
    setIsSubmitting(true);
    onTypingStart();

    try {
      const messageData = await retryWithBackoff(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TIMEOUTS.MESSAGE_SEND);

          try {
            const response = await fetch(API.sessionMessages(sessionId), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
              },
              body: JSON.stringify({
                content: sanitizedMessage,
                locale: locale,
                page_context: getPageContext(),
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            let data;
            try {
              data = await response.json();
            } catch (parseError) {
              throw new Error('Invalid response from message server');
            }

            if (!response.ok) {
              const errorMessage = parseApiError(data, 'Failed to send message');

              // Check if session expired
              if (response.status === 401 || response.status === 404 ||
                  errorMessage.toLowerCase().includes('expired') ||
                  errorMessage.toLowerCase().includes('not found')) {
                throw createSessionError(
                  errorMessage,
                  WidgetErrorCode.SESSION_EXPIRED
                );
              }

              if (response.status >= 500) {
                throw createNetworkError(
                  errorMessage,
                  WidgetErrorCode.NETWORK_SERVER_ERROR
                );
              }

              throw new Error(errorMessage);
            }

            if (data.status !== 'success') {
              throw new Error(parseApiError(data, 'Failed to send message'));
            }

            return data.data;
          } catch (fetchError: any) {
            clearTimeout(timeoutId);

            if (fetchError.name === 'AbortError') {
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
            logError(error, { message: sanitizedMessage, attempt, action: 'sendMessage' });
          },
        }
      );

      // Reload all messages from server to get the agent's response
      await loadLatestMessages();
    } catch (err: any) {
      const errorMessage = err.userMessage || err.message || 'Failed to send message';
      onError(errorMessage);
      logError(err, { message: sanitizedMessage, sessionId, action: 'handleSubmit' });

      // Remove temp message via explicit failure callback
      onMessageFailed?.(userMessage.id);
      setInput(sanitizedMessage);
    } finally {
      setIsSubmitting(false);
      onTypingEnd();
      const duration = nowPerf() - start;
      logPerf('messageSendTotal', duration);
    }
  };

  const loadLatestMessages = async () => {
    if (!sessionId || !authToken) return;

    try {
      const response = await fetch(API.sessionMessages(sessionId), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
            // Filter out agent greeting messages
            if (msg.sender === 'assistant') {
              const userMessages = data.data.messages.filter((m: any) => m.sender === 'user');
              return userMessages.length > 0;
            }
            return true;
          })
          .map((msg: any) => ({
            id: msg.id,
            text: msg.content,
            from: msg.sender as 'user' | 'agent',
            timestamp: msg.created_at ? new Date(msg.created_at).getTime() : nowMs(),
            sources: msg.sources || [],
          }));

        // The parent component will handle updating the messages
        // For now, we'll emit the latest messages
        const recentThreshold = nowMs() - 10000;
        loadedMessages.forEach(msg => {
          if (msg.from === 'agent' && msg.timestamp && msg.timestamp > recentThreshold) { // Recent messages
            onMessageSent(msg);
          }
        });
      }
    } catch (err) {
      logError(err instanceof Error ? err.message : String(err), { sessionId, action: 'loadLatestMessages' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={translate(locale, 'typeYourMessage')}
        aria-label={translate(locale, 'typeYourMessageLabel')}
        disabled={disabled || isSubmitting || !sessionId}
        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || isSubmitting || !input.trim() || !sessionId}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? translate(locale, 'sending') : translate(locale, 'send')}
      </button>
    </form>
  );
}