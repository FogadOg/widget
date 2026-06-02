import { renderHook, act, waitFor } from '@testing-library/react';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock error-handling helpers. retryWithBackoff executes the operation directly
// so the real fetch branch logic inside getAuthToken runs.
jest.mock('../lib/errorHandling', () => {
  const actual = jest.requireActual('../lib/errorHandling');
  return {
    createAuthError: jest.fn((message: string, code: number) => {
      const error = new Error(message) as any;
      error.code = code;
      error.type = 'AUTH_ERROR';
      error.userMessage = message;
      error.retryable = true;
      return error;
    }),
    createNetworkError: jest.fn(
      (message: string, code: number) =>
        new actual.WidgetError(
          message,
          code,
          'NETWORK_ERROR',
          true,
          'Network error. Please check your connection and try again.',
        ),
    ),
    retryWithBackoff: jest.fn(async (fn: () => Promise<any>) => fn()),
    logError: jest.fn(),
    parseApiError: jest.fn((data: any, fallback: string) => data?.message || data?.detail || fallback),
    WidgetErrorCode: {
      INVALID_CLIENT: 1001,
      AUTH_TOKEN_FAILED: 1002,
      ORIGIN_NOT_ALLOWED: 1004,
      NETWORK_TIMEOUT: 3001,
      NETWORK_SERVER_ERROR: 3003,
    },
    isNetworkError: jest.fn((error: any) => error?.type === 'NETWORK_ERROR'),
  };
});

jest.mock('../lib/api', () => ({
  API: { widgetToken: jest.fn(() => 'https://api.test.com/api/v1/auth/widget-token') },
  isApiConfigured: jest.fn(() => true),
  getApiBaseUrl: jest.fn(() => 'https://api.test.com'),
  embedOriginHeader: jest.fn(() => ({})),
}));

import { useWidgetAuth } from '../hooks/useWidgetAuth';

const okToken = (token: string, expiresIn?: number) => ({
  ok: true,
  json: () => Promise.resolve(expiresIn === undefined ? { token } : { token, expires_in: expiresIn }),
});

describe('useWidgetAuth auto-refresh and edge branches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.test.com';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('captures server expiry and arms a silent refresh that fires before expiry', async () => {
    jest.useFakeTimers();

    // Initial token carries a 1-hour expiry, prompting scheduleAutoRefresh.
    mockFetch.mockResolvedValueOnce(okToken('tok-1', 3600));

    const { result } = renderHook(() => useWidgetAuth());

    await act(async () => {
      const token = await result.current.getAuthToken('client-a', 'https://parent.example');
      expect(token).toBe('tok-1');
    });

    expect(result.current.authToken).toBe('tok-1');
    // expires_in was honoured (not the null fallback path).
    expect(typeof result.current.getTokenExpiresAt()).toBe('number');
    expect(result.current.getTokenExpiresAt()).toBeGreaterThan(Date.now());

    // The scheduled refresh should fetch a fresh token when it fires.
    mockFetch.mockResolvedValueOnce(okToken('tok-2', 3600));

    // Refresh fires 2 min before expiry → advance just past that point.
    await act(async () => {
      jest.advanceTimersByTime((3600 - 120) * 1000 + 10);
      // allow the awaited refresh promise chain to settle
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.authToken).toBe('tok-2'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to no scheduled refresh when the server omits expires_in', async () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValueOnce(okToken('tok-no-expiry'));

    const { result } = renderHook(() => useWidgetAuth());

    await act(async () => {
      await result.current.getAuthToken('client-b');
    });

    expect(result.current.authToken).toBe('tok-no-expiry');
    expect(result.current.getTokenExpiresAt()).toBeNull();

    // No timer was armed, so advancing time triggers no extra fetch.
    await act(async () => {
      jest.advanceTimersByTime(10 * 60 * 60 * 1000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('scheduleAutoRefresh ignores invalid expiry values and accepts ISO strings', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useWidgetAuth());

    // Non-finite (unparseable string) → early return, no timer, no expiry set.
    act(() => {
      result.current.scheduleAutoRefresh('not-a-real-date', 'client-c');
    });
    expect(result.current.getTokenExpiresAt()).toBeNull();

    // Non-positive epoch → early return.
    act(() => {
      result.current.scheduleAutoRefresh(0, 'client-c');
    });
    expect(result.current.getTokenExpiresAt()).toBeNull();

    // Valid ISO string (number-vs-string branch) → expiry recorded and refresh armed.
    const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    act(() => {
      result.current.scheduleAutoRefresh(futureIso, 'client-c', 'https://parent.example');
    });
    expect(result.current.getTokenExpiresAt()).toBeGreaterThan(Date.now());

    mockFetch.mockResolvedValueOnce(okToken('tok-iso', 3600));
    await act(async () => {
      jest.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.authToken).toBe('tok-iso'));
  });

  it('clearAuth cancels a pending auto-refresh timer', async () => {
    jest.useFakeTimers();
    mockFetch.mockResolvedValueOnce(okToken('tok-clear', 3600));

    const { result } = renderHook(() => useWidgetAuth());
    await act(async () => {
      await result.current.getAuthToken('client-d');
    });
    expect(result.current.getTokenExpiresAt()).toBeGreaterThan(0);

    act(() => {
      result.current.clearAuth();
    });

    expect(result.current.authToken).toBeNull();
    expect(result.current.getTokenExpiresAt()).toBeNull();

    // Timer was cleared → advancing time does not trigger a refresh fetch.
    await act(async () => {
      jest.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('clears the pending refresh timer on unmount', async () => {
    jest.useFakeTimers();
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    mockFetch.mockResolvedValueOnce(okToken('tok-unmount', 3600));

    const { result, unmount } = renderHook(() => useWidgetAuth());
    await act(async () => {
      await result.current.getAuthToken('client-e');
    });

    clearSpy.mockClear();
    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('treats HTTP 429 as a non-retryable auth failure', async () => {
    const { createAuthError } = jest.requireMock('../lib/errorHandling');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ message: 'Too many requests' }),
    });

    const { result } = renderHook(() => useWidgetAuth());
    await act(async () => {
      const token = await result.current.getAuthToken('client-f');
      expect(token).toBeNull();
    });

    expect(result.current.authError).toBe('Too many requests');
    expect(createAuthError).toHaveBeenCalledWith('Too many requests', 1002);
  });
});
