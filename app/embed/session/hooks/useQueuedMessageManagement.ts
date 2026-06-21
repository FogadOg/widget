import { useCallback, useEffect, useRef } from 'react';
import { getQueuedMessages, removeQueuedMessage, incrementAttempt } from '../../../../src/lib/offline';
import { API } from '../../../../lib/api';
import * as helpers from '../helpers';
import type { Message } from '../../../../types/widget';

const MAX_QUEUE_ATTEMPTS = 5;

export function useQueuedMessageManagement({
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
}: {
  sessionId: string | null;
  sessionIdRef: React.MutableRefObject<string | null>;
  authToken: string | null | undefined;
  authTokenRef: React.MutableRefObject<string | null>;
  activeLocale: string;
  embedHeaders: Record<string, string>;
  sessionStorageKey: string;
  didInitialFlushRef: React.MutableRefObject<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadSessionMessages: (sessionId: string, token?: string) => Promise<void>;
}) {
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

  const flushQueuedMessages = useCallback(async () => {
    const storedSession = helpers.getStoredSession(sessionStorageKey);
    const sid = sessionIdRef.current || sessionId || storedSession?.sessionId || null;
    const token = authTokenRef.current || authToken || null;
    if (!sid || !token) return;
    try {
      const queued = await getQueuedMessages();
      if (!queued || queued.length === 0) return;

      for (const item of queued.sort((a, b) => (a.seq || 0) - (b.seq || 0))) {
        const currentAttempts = item.attempts || 0;
        if (currentAttempts >= MAX_QUEUE_ATTEMPTS) {
          // Permanently failed — remove from queue, mark as failed in UI
          try { await removeQueuedMessage(item.id); } catch {}
          setMessages(prev => prev.map(m =>
            m.id === item.id ? { ...m, pending: false, failed: true } : m
          ));
          continue;
        }
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
            // A permanent client error (4xx other than 408/429) will never succeed
            // on retry. Drop it immediately and continue to the next queued message,
            // instead of burning all attempts and head-of-line-blocking the queue. (#14)
            const isPermanent = resp.status >= 400 && resp.status < 500
              && resp.status !== 408 && resp.status !== 429;
            if (isPermanent) {
              try { await removeQueuedMessage(item.id); } catch {}
              setMessages(prev => prev.map(m => m.id === item.id ? { ...m, pending: false, failed: true } : m));
              continue;
            }
            // Transient error (5xx / 408 / 429): increment attempts and stop the
            // flush — subsequent sends would likely hit the same condition.
            const newAttempts = currentAttempts + 1;
            try { await incrementAttempt(item.id); } catch {}
            setMessages(prev => prev.map(m => m.id === item.id ? { ...m, attempts: newAttempts } : m));
            if (newAttempts >= MAX_QUEUE_ATTEMPTS) {
              try { await removeQueuedMessage(item.id); } catch {}
              setMessages(prev => prev.map(m => m.id === item.id ? { ...m, pending: false, failed: true } : m));
            }
            break;
          }

          await removeQueuedMessage(item.id);
          await loadSessionMessages(sid, token);
        } catch (err) {
          const newAttempts = currentAttempts + 1;
          try { await incrementAttempt(item.id); } catch {}
          setMessages(prev => prev.map(m => m.id === item.id ? { ...m, attempts: newAttempts } : m));
          if (newAttempts >= MAX_QUEUE_ATTEMPTS) {
            try { await removeQueuedMessage(item.id); } catch {}
            setMessages(prev => prev.map(m => m.id === item.id ? { ...m, pending: false, failed: true } : m));
          }
          break;
        }
      }
    } catch (err) {
      // ignore
    }
  }, [activeLocale, embedHeaders, sessionStorageKey, sessionId, authToken]);

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

    // Attempt an immediate flush if online. Guarded so it runs only once on
    // mount: `flushQueuedMessages` changes identity on every render (it closes
    // over the non-memoized `loadSessionMessages`), so without this guard the
    // effect would re-fire each render and, with a non-empty queue, loop
    // forever. Session-ready flushes are still covered by the explicit calls
    // after createSession/validateAndRestoreSession.
    if (navigator.onLine && !didInitialFlushRef.current) {
      didInitialFlushRef.current = true;
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
  }, [activeLocale, embedHeaders, loadSessionMessages, sessionStorageKey, sessionId, authToken]);

  return { flushQueuedMessages };
}
