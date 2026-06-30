import React, { useCallback } from 'react'
import { API } from '../../../../lib/api'
import { t as translate } from '../../../../lib/i18n'
import { getPageContext as helpersGetPageContext } from '../helpers'
import { fetchWithTimeout } from '../resilientFetch'
import {
  queueMessage,
  getQueuedMessages,
  removeQueuedMessage,
  incrementAttempt,
  isOnline,
} from '../../../../src/lib/offline'
import {
  retryWithBackoff,
  createNetworkError,
  WidgetError,
  WidgetErrorType,
  WidgetErrorCode,
} from '../../../../lib/errorHandling'
import { TIMEOUTS } from '../../../../lib/constants'
import { MessageType } from '../DocsClient.types'
import { type PromptInputMessage } from '@/components/ai-elements/prompt-input'
import { toast } from 'sonner'

// Persisted send attempts before a queued message is declared permanently
// failed (matches the chat widget's useQueuedMessageManagement).
const MAX_QUEUE_ATTEMPTS = 5;
// Only flush/retry items this widget enqueued. The offline IndexedDB store is
// shared by origin, so tagging keeps a co-embedded chat widget's queue separate.
const QUEUE_SOURCE = 'docs';

interface UseMessageOperationsParams {
  sessionId: string | null;
  authToken: string | null | undefined;
  activeLocale: string;
  initialParentOrigin?: string;
  initialPreviewConfig?: string;
  embedHeaders: Record<string, string>;
  setStatus: (status: "submitted" | "streaming" | "ready" | "error") => void;
  setError: (err: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>;
  setMessageFeedbackSubmitted: React.Dispatch<React.SetStateAction<Set<string>>>;
  setText: (text: string) => void;
  loadSessionMessages: (sessionId: string, token: string, isNewSession?: boolean) => Promise<void>;
}

export function useMessageOperations({
  sessionId,
  authToken,
  activeLocale,
  initialParentOrigin,
  initialPreviewConfig,
  embedHeaders,
  setStatus,
  setError,
  setMessages,
  setMessageFeedbackSubmitted,
  setText,
  loadSessionMessages,
}: UseMessageOperationsParams) {
  // Mark the optimistic bubble for `queueId` as failed (clears the spinner and
  // lets the UI offer a Retry affordance) and surface a localized message.
  const markFailed = useCallback((queueId: string, errorKey: string) => {
    setMessages(prev => prev.map(m =>
      m.queueId === queueId ? { ...m, pending: false, failed: true } : m
    ));
    setError(translate(activeLocale, errorKey));
    // Return the composer to a usable state — the failure is already surfaced by
    // the error banner and the per-message Retry button, so we don't trap input
    // in an "error" status (matches the original finally→ready behavior).
    setStatus("ready");
  }, [activeLocale, setMessages, setError, setStatus]);

  // POST one message with a bounded timeout + exponential-backoff retry for
  // transient failures (network drop / timeout / 5xx). 4xx is non-retryable.
  // Returns the parsed success payload, or throws the final WidgetError.
  const postMessage = useCallback(async (sid: string, token: string, content: string, idemKey?: string) => {
    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(API.sessionMessages(sid), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          // Stable per-message key so a retry (after timeout/drop) is
          // de-duplicated server-side instead of posting a second reply.
          ...(idemKey ? { 'Idempotency-Key': idemKey } : {}),
          ...embedHeaders,
        },
        body: JSON.stringify({
          content,
          locale: activeLocale,
          page_context: helpersGetPageContext(),
        }),
      }, TIMEOUTS.MESSAGE_SEND);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') return data;
        // 200 with a non-success envelope — treat as a server-side failure.
        throw createNetworkError('Invalid response', WidgetErrorCode.NETWORK_SERVER_ERROR);
      }

      const body = await response.json().catch(() => ({} as any));
      // 409 = an identical send is still in flight server-side; retrying after
      // backoff lets the original commit so we replay its result.
      const retryable = response.status >= 500 || response.status === 408
        || response.status === 429 || response.status === 409;
      if (retryable) {
        // Retryable: let retryWithBackoff re-attempt (auto-reconnect).
        throw createNetworkError(body?.detail || `Server error ${response.status}`, WidgetErrorCode.NETWORK_SERVER_ERROR);
      }
      // Permanent client error — never retried, surfaced verbatim if useful.
      throw new WidgetError(
        body?.detail || 'Failed to send message',
        WidgetErrorCode.MESSAGE_SEND_FAILED,
        WidgetErrorType.MESSAGE_ERROR,
        false,
        body?.detail || translate(activeLocale, 'failedToSendMessage'),
      );
    }, { maxRetries: 2, initialDelay: 1000 });
  }, [activeLocale, embedHeaders]);

  // Send message to API. `queueId` correlates the optimistic bubble with its
  // offline-queue entry so a failure can be retried with the text preserved.
  const sendMessageToAPI = useCallback(async (content: string, queueId?: string) => {
    if (!sessionId || !authToken) {
      console.error('No sessionId or authToken available');
      return;
    }

    const qid = queueId || `user-${Date.now()}`;

    // Offline: don't even attempt the request. Persist the message and surface
    // an offline banner — it auto-sends when connectivity returns.
    if (!isOnline()) {
      try {
        await queueMessage({ id: qid, text: content, seq: Date.now(), timestamp: Date.now(), attempts: 0, source: QUEUE_SOURCE });
      } catch { /* IndexedDB unavailable — fall through to a friendly error */ }
      setMessages(prev => prev.map(m => m.queueId === qid ? { ...m, pending: true, failed: false } : m));
      setStatus("ready");
      return;
    }

    try {
      setStatus("streaming");
      await postMessage(sessionId, authToken, content, qid);
      // Success: drop any queued copy and reload to pick up the agent's reply.
      try { await removeQueuedMessage(qid); } catch { /* noop */ }
      setMessages(prev => prev.map(m => m.queueId === qid ? { ...m, pending: false, failed: false } : m));
      await loadSessionMessages(sessionId, authToken);
      setStatus("ready");
    } catch (err) {
      const retryable = !(err instanceof WidgetError) || err.retryable;
      if (retryable) {
        // Transient: keep the text in the queue so the user (or the online
        // listener) can retry it later.
        console.error('Error sending message:', err);
        try {
          await queueMessage({ id: qid, text: content, seq: Date.now(), timestamp: Date.now(), attempts: 0, source: QUEUE_SOURCE });
        } catch { /* noop */ }
        const isTimeout = err instanceof WidgetError && err.code === WidgetErrorCode.NETWORK_TIMEOUT;
        markFailed(qid, isTimeout ? 'messageSendTimeout' : 'networkError');
      } else {
        // Permanent client error — no point retrying.
        console.error('Failed to send message:', err);
        markFailed(qid, 'failedToSendMessage');
      }
    }
  }, [sessionId, authToken, postMessage, loadSessionMessages, setMessages, setStatus, markFailed]);

  // Resend a single queued message — wired to the per-message Retry button and
  // reused by the online-recovery flush.
  const retryQueuedMessage = useCallback(async (queueId: string) => {
    if (!sessionId || !authToken) return;
    const queued = await getQueuedMessages().catch(() => [] as any[]);
    const item = queued.find((q: any) => q.id === queueId && q.source === QUEUE_SOURCE);
    if (!item) return;
    setMessages(prev => prev.map(m => m.queueId === queueId ? { ...m, pending: true, failed: false } : m));
    setError(null);
    await sendMessageToAPI(item.text, queueId);
  }, [sessionId, authToken, sendMessageToAPI, setMessages, setError]);

  // Flush every queued docs message in order. Stops on the first transient
  // failure to preserve ordering; drops permanently-failed items so the queue
  // can't head-of-line block. Called on regained connectivity.
  const flushQueue = useCallback(async () => {
    if (!sessionId || !authToken || !isOnline()) return;
    const queued = await getQueuedMessages().catch(() => [] as any[]);
    const mine = queued.filter((q: any) => q.source === QUEUE_SOURCE).sort((a: any, b: any) => (a.seq || 0) - (b.seq || 0));
    for (const item of mine) {
      if ((item.attempts || 0) >= MAX_QUEUE_ATTEMPTS) {
        try { await removeQueuedMessage(item.id); } catch { /* noop */ }
        setMessages(prev => prev.map(m => m.queueId === item.id ? { ...m, pending: false, failed: true } : m));
        continue;
      }
      try {
        setMessages(prev => prev.map(m => m.queueId === item.id ? { ...m, pending: true, failed: false } : m));
        await postMessage(sessionId, authToken, item.text, item.id);
        try { await removeQueuedMessage(item.id); } catch { /* noop */ }
        setMessages(prev => prev.map(m => m.queueId === item.id ? { ...m, pending: false, failed: false } : m));
        await loadSessionMessages(sessionId, authToken);
      } catch (err) {
        const permanent = err instanceof WidgetError && !err.retryable;
        if (permanent) {
          try { await removeQueuedMessage(item.id); } catch { /* noop */ }
          setMessages(prev => prev.map(m => m.queueId === item.id ? { ...m, pending: false, failed: true } : m));
          continue;
        }
        try { await incrementAttempt(item.id); } catch { /* noop */ }
        setMessages(prev => prev.map(m => m.queueId === item.id ? { ...m, pending: false, failed: true, attempts: (m.attempts || 0) + 1 } : m));
        break; // transient — stop and wait for the next online/retry trigger
      }
    }
  }, [sessionId, authToken, postMessage, loadSessionMessages, setMessages]);

  // Handle message feedback submission
  const handleSubmitMessageFeedback = useCallback(async (messageId: string, feedbackType: string = 'thumbs_up') => {
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
        console.error('Failed to submit message feedback:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
      }
    } catch (error) {
      console.error('Error submitting message feedback:', error);
    }
  }, [authToken, initialParentOrigin]);

  const addUserMessage = useCallback(
    async (content: string) => {

      if (!sessionId || !authToken) {
        console.error('Cannot send message: missing sessionId or authToken', { sessionId, authToken: !!authToken });
        setError(translate(activeLocale, 'sessionOrAuthError'));
        return;
      }

      const qid = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const userMessage: MessageType = {
        key: qid,
        from: "user",
        queueId: qid,
        versions: [
          {
            id: qid,
            content,
          },
        ],
      };

      setMessages((prev) => [...prev, userMessage]);
      setStatus("submitted");

      await sendMessageToAPI(content, qid);
    },
    [sendMessageToAPI, sessionId, authToken, setError, setMessages, setStatus]
  );

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    // Preview mode: add user message then return a dummy agent reply
    if (initialPreviewConfig) {
      const content = message.text || 'Sent with attachments';
      const ts = Date.now();
      setMessages(prev => [
        ...prev,
        { key: `user-${ts}`, from: 'user', versions: [{ id: `user-${ts}`, content }] },
      ]);
      setText('');
      setStatus('streaming');
      setTimeout(() => {
        setMessages(prev => [
          ...prev,
          {
            key: `preview-agent-${Date.now()}`,
            from: 'agent',
            versions: [{ id: `preview-agent-${Date.now()}`, content: 'This is a preview — in the live widget your AI agent will respond here.' }],
          },
        ]);
        setStatus('ready');
      }, 800);
      return;
    }

    setStatus("submitted");

    if (message.files?.length) {
      toast.success("Files attached", {
        description: `${message.files.length} file(s) attached to message`,
      });
    }

    addUserMessage(message.text || "Sent with attachments");
    setText("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    // Don't set status here - let addUserMessage handle it
    addUserMessage(suggestion);
  };

  return { sendMessageToAPI, handleSubmitMessageFeedback, addUserMessage, handleSubmit, handleSuggestionClick, flushQueue, retryQueuedMessage };
}
