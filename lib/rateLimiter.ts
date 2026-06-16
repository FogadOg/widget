/* Simple in-memory sliding-window rate limiter for the widget
   This is client-side only and keyed by sessionId. It keeps recent
   send timestamps and enforces a max messages per window rule.
*/
import { RATE_LIMIT } from './constants';

type WindowMap = Map<string, number[]>;

const windows: WindowMap = new Map();

function now() {
  return Date.now();
}

function cleanup(sessionId: string) {
  const arr = windows.get(sessionId) || [];
  const cutoff = now() - RATE_LIMIT.WINDOW_MS;
  const filtered = arr.filter(ts => ts > cutoff);
  windows.set(sessionId, filtered);
  return filtered;
}

export function checkAndConsume(sessionId: string): { allowed: boolean; retryAfterMs?: number } {
  if (!sessionId) return { allowed: true };

  const arr = cleanup(sessionId);

  if (arr.length < RATE_LIMIT.MAX_MESSAGES) {
    // record the send
    arr.push(now());
    windows.set(sessionId, arr);
    return { allowed: true };
  }

  // Rate limit hit. compute retry-after based on oldest timestamp in window
  const oldest = arr[0] || now();
  const retryAfterMs = Math.max(0, RATE_LIMIT.WINDOW_MS - (now() - oldest));
  return { allowed: false, retryAfterMs };
}

export function peek(sessionId: string): { allowed: boolean; retryAfterMs?: number } {
  if (!sessionId) return { allowed: true };
  const arr = cleanup(sessionId);
  if (arr.length < RATE_LIMIT.MAX_MESSAGES) return { allowed: true };
  const oldest = arr[0] || now();
  const retryAfterMs = Math.max(0, RATE_LIMIT.WINDOW_MS - (now() - oldest));
  return { allowed: false, retryAfterMs };
}

export function resetLimiter(sessionId: string) {
  windows.delete(sessionId);
}

// Clears all rate-limit state. Intended for test isolation (the window map is
// module-level and would otherwise persist across tests in the same file).
export function resetAllLimiters() {
  windows.clear();
}
