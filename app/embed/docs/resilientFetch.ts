import { TIMEOUTS } from '../../../lib/constants';
import { createNetworkError, WidgetErrorCode } from '../../../lib/errorHandling';

/**
 * `fetch` bounded by an AbortController timeout so a hung request can never
 * leave the docs widget spinning forever — the #1 "users wonder what happened"
 * failure mode. On timeout we throw a typed, retryable NETWORK_TIMEOUT
 * WidgetError so callers can surface a friendly message and/or retry; other
 * fetch rejections (offline, DNS, CORS) propagate unchanged.
 *
 * This is the timeout primitive only — it does NOT retry. Callers that want
 * automatic reconnect compose `retryWithBackoff` around it (see
 * useMessageOperations), mirroring the chat widget's EmbedClient pattern.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUTS.MESSAGE_SEND,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw createNetworkError('Request timed out', WidgetErrorCode.NETWORK_TIMEOUT);
    }
    // Some environments surface AbortError as a plain object/Error.
    if ((err as { name?: string })?.name === 'AbortError') {
      throw createNetworkError('Request timed out', WidgetErrorCode.NETWORK_TIMEOUT);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
