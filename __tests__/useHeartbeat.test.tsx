import { renderHook } from '@testing-library/react';
import { useHeartbeat } from '../app/embed/useHeartbeat';
import { HEARTBEAT_INTERVAL_MS } from '../lib/constants';

describe('useHeartbeat', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    // @ts-expect-error test override
    global.fetch = fetchMock;
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

  const params = { sessionId: 'sess-1', token: 'tok-1', embedHeaders: { 'X-Embed-Origin': 'https://host.example' } };

  it('beats immediately and then on the interval while visible', async () => {
    renderHook(() => useHeartbeat(params));

    // Immediate beat on mount.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/sessions/sess-1/heartbeat');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(init.headers['X-Embed-Origin']).toBe('https://host.example');

    await jest.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not beat when the tab is hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    renderHook(() => useHeartbeat(params));

    expect(fetchMock).not.toHaveBeenCalled();
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing without a session or token', () => {
    renderHook(() => useHeartbeat({ ...params, sessionId: null }));
    renderHook(() => useHeartbeat({ ...params, token: null }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops beating after unmount', () => {
    const { unmount } = renderHook(() => useHeartbeat(params));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unmount();
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
