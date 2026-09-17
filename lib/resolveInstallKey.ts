import { API } from './api';

export type ResolvedInstallKey = {
  clientId: string;
  agentId: string;
  configId: string;
  locale?: string;
};

/**
 * `not_found` is definitive (bad key, 4xx, malformed resolver response): the
 * install is misconfigured and the caller should render the permanent
 * invalid-key card. `disabled` (403) means the key is real but the widget is
 * switched off — typically by the plan's agent limit — which needs a different
 * fix, so it gets its own card. `unavailable` is transient (network failure, timeout,
 * 5xx/408/429): the backend couldn't answer right now, so the caller must NOT
 * present it as a configuration error — render the retryable
 * `resolver_unavailable` card instead so the loader reloads the embed.
 */
export type ResolveInstallKeyResult =
  | ({ status: 'resolved' } & ResolvedInstallKey)
  | { status: 'not_found' }
  | { status: 'disabled' }
  // `reason` is a short human-readable cause ("HTTP 502", "fetch failed:
  // ECONNREFUSED"). It exists purely so the error card can say WHY the resolver
  // was unreachable — without it the only signal is a generic card, and
  // diagnosing a down backend means reproducing the whole embed in a browser.
  | { status: 'unavailable'; reason?: string };

const MAX_ATTEMPTS = 3;
const PER_ATTEMPT_TIMEOUT_MS = 4000;
// Short in-render backoff. Worst case (~13s of fetch time) stays under the
// loader's 15s prod per-attempt hard timeout, whose cache-busted reload is the
// fallback recovery if the whole render stalls anyway.
const RETRY_DELAY_MS = [250, 500];

function isTransientHttpStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * Undici wraps connection failures in a generic `TypeError: fetch failed` whose
 * real cause (ECONNREFUSED, ENOTFOUND, …) only lives on `.cause`. Unwrap one
 * level so the reason names the actual problem.
 */
function describeFetchError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return `timed out after ${PER_ATTEMPT_TIMEOUT_MS}ms`;
    }
    const cause = (err as { cause?: unknown }).cause;
    const causeCode =
      cause && typeof cause === 'object' && 'code' in cause
        ? String((cause as { code?: unknown }).code)
        : cause instanceof Error
          ? cause.message
          : undefined;
    return causeCode ? `${err.message}: ${causeCode}` : err.message;
  }
  return 'unknown error';
}

async function attemptResolve(key: string): Promise<ResolveInstallKeyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(API.embedResolveServer(key), { cache: 'no-store', signal: controller.signal });
    if (!res.ok) {
      if (isTransientHttpStatus(res.status)) {
        return { status: 'unavailable', reason: `HTTP ${res.status}` };
      }
      return res.status === 403 ? { status: 'disabled' } : { status: 'not_found' };
    }
    const json = await res.json();
    const data = json?.data;
    if (!data?.clientId || !data?.agentId || !data?.configId) return { status: 'not_found' };
    return {
      status: 'resolved',
      clientId: String(data.clientId),
      agentId: String(data.agentId),
      configId: String(data.configId),
      locale: data.locale ? String(data.locale) : undefined,
    };
  } catch (err) {
    // Timeouts, DNS/socket failures, and garbage bodies behind a proxy all
    // land here. Treat them as retryable rather than telling the customer
    // their installation is broken — but keep the cause, since "backend is
    // down" and "resolver timed out" call for very different responses.
    return { status: 'unavailable', reason: describeFetchError(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a single install key (wgt_…) to the embed triple via the backend
 * resolver, server-side, retrying transient failures with a short backoff so
 * a one-off backend blip doesn't surface as a visitor-facing error card.
 */
export async function resolveInstallKeyServer(key: string): Promise<ResolveInstallKeyResult> {
  let last: ResolveInstallKeyResult = { status: 'unavailable' };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    last = await attemptResolve(key);
    if (last.status !== 'unavailable') return last;
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS[attempt] ?? 500));
    }
  }
  return last;
}
