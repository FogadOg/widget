/**
 * The 429 back-off path of `useHeartbeat`, plus the visibility-resume beat.
 *
 * `parseRetryAfterMs` is module-private, so every case below drives it the way
 * production does: through a real 429 response, then asserts on *when the next
 * beat is allowed*. That is the observable contract — a longer window means
 * fewer pings, which is the whole point of honouring Retry-After.
 *
 * Beats are nudged with a `visibilitychange` event rather than by advancing to
 * the next interval tick. HEARTBEAT_INTERVAL_MS happens to equal the 20s
 * fallback window, so interval-driven assertions cannot distinguish "suppressed
 * by back-off" from "not due yet".
 */
import { renderHook } from '@testing-library/react';
import { useHeartbeat } from '../app/embed/useHeartbeat';

const params = {
  sessionId: 'sess-1',
  token: 'tok-1',
  embedHeaders: { 'X-Embed-Origin': 'https://host.example' },
};

/** A 429 carrying the given Retry-After value (null = header absent). */
const tooManyRequests = (retryAfter: string | null) => ({
  status: 429,
  headers: {
    get: (name: string) => (name === 'Retry-After' ? retryAfter : null),
  },
});

describe('useHeartbeat back-off', () => {
  let fetchMock: jest.Mock;

  /** Let the in-flight fetch settle so `inFlightRef` clears. */
  const flush = () => jest.advanceTimersByTimeAsync(0);

  /** Ask for a beat without relying on the interval. */
  const nudge = async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
  };

  const mountWith = async (retryAfter: string | null) => {
    fetchMock = jest.fn().mockResolvedValue(tooManyRequests(retryAfter));
    // @ts-expect-error test override
    global.fetch = fetchMock;
    renderHook(() => useHeartbeat(params));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    // Fixed clock so the HTTP-date case has deterministic arithmetic.
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('honours a numeric Retry-After, in seconds', async () => {
    await mountWith('30');

    await jest.advanceTimersByTimeAsync(29_000);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2_000);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honours an HTTP-date Retry-After', async () => {
    await mountWith('Thu, 01 Jan 2026 00:00:45 GMT');

    await jest.advanceTimersByTimeAsync(40_000);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(6_000);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('floors a zero Retry-After at one second rather than hammering', async () => {
    await mountWith('0');

    await jest.advanceTimersByTimeAsync(500);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(700);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to 20s when the header is absent', async () => {
    await mountWith(null);

    await jest.advanceTimersByTimeAsync(19_000);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to 20s when the header is unparseable', async () => {
    await mountWith('sometime next tuesday');

    await jest.advanceTimersByTimeAsync(19_000);
    await nudge();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the longest window when a second 429 asks for less', async () => {
    await mountWith('60');

    // A later 429 with a shorter window must not shorten the existing back-off.
    fetchMock.mockResolvedValue(tooManyRequests('1'));
    await jest.advanceTimersByTimeAsync(30_000);
    await nudge();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useHeartbeat visibility resume', () => {
  let fetchMock: jest.Mock;
  let visibility: string;

  beforeEach(() => {
    jest.useFakeTimers();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    fetchMock = jest.fn().mockResolvedValue({ status: 200, headers: { get: () => null } });
    // @ts-expect-error test override
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('beats immediately when the tab becomes visible again', async () => {
    renderHook(() => useHeartbeat(params));
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('swallows a rejected beat so presence never surfaces an error', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(() => renderHook(() => useHeartbeat(params))).not.toThrow();
    await expect(jest.advanceTimersByTimeAsync(0)).resolves.not.toThrow();

    // A failed beat must clear the in-flight latch, or the hook would wedge.
    document.dispatchEvent(new Event('visibilitychange'));
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
