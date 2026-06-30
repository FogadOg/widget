import { useEffect, useRef } from 'react';
import { API } from '../../lib/api';
import { HEARTBEAT_INTERVAL_MS } from '../../lib/constants';

interface UseHeartbeatParams {
  sessionId: string | null;
  token: string | null;
  embedHeaders: Record<string, string>;
}

/**
 * Presence heartbeat. While the widget's tab is visible and we have a live
 * session + token, POST a lightweight ping to the backend every
 * HEARTBEAT_INTERVAL_MS. The backend stamps `last_seen_at`, which drives the
 * admin "live visitors" count and keeps an actively-viewing visitor's session
 * from expiring mid-read.
 *
 * Best-effort by design: failures are swallowed (presence must never surface an
 * error to the visitor). Pinging pauses when the tab is hidden and resumes —
 * with an immediate beat — when it becomes visible again, so a backgrounded tab
 * correctly drops off the live count.
 */
export function useHeartbeat({ sessionId, token, embedHeaders }: UseHeartbeatParams): void {
  // Keep the latest headers in a ref so the effect doesn't re-subscribe when the
  // (re-created each render) embedHeaders object identity changes.
  const headersRef = useRef(embedHeaders);
  headersRef.current = embedHeaders;

  useEffect(() => {
    if (!sessionId || !token) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }

    let cancelled = false;

    const beat = () => {
      if (cancelled || document.visibilityState !== 'visible') {
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      fetch(API.sessionHeartbeat(sessionId), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          ...headersRef.current,
        },
        signal: controller.signal,
        keepalive: true,
      })
        .catch(() => {
          // best-effort: ignore network/timeout/abort errors
        })
        .finally(() => clearTimeout(timer));
    };

    // Beat immediately so a freshly-opened widget shows up without waiting a
    // full interval, then on a steady cadence.
    beat();
    const intervalId = setInterval(beat, HEARTBEAT_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        beat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [sessionId, token]);
}
