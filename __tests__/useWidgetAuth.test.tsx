 

import { renderHook, act, waitFor } from '@testing-library/react';
import { useWidgetAuth } from '../hooks/useWidgetAuth';
import { embedOriginHeader } from '../lib/api';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock error handling functions
jest.mock('../lib/errorHandling', () => ({
  createAuthError: jest.fn((message, code) => {
    const error = new Error(message) as any;
    error.code = code;
    error.type = 'AUTH_ERROR';
    error.userMessage = message;
    return error;
  }),
  createNetworkError: jest.fn((message, code) => {
    const error = new Error(message) as any;
    error.code = code;
    error.type = 'NETWORK_ERROR';
    error.retryable = true;
    error.userMessage = message;
    return error;
  }),
  retryWithBackoff: jest.fn(),
  logError: jest.fn(),
  parseApiError: jest.fn((data, defaultMessage) => data?.message || defaultMessage),
  WidgetErrorCode: {
    INVALID_CLIENT: 1001,
    AUTH_TOKEN_FAILED: 1002,
    AUTH_EXPIRED: 1003,
    ORIGIN_NOT_ALLOWED: 1004,
    NETWORK_TIMEOUT: 3001,
    NETWORK_SERVER_ERROR: 3003,
  },
  isNetworkError: jest.fn((error) => {
    // explicit type flag takes precedence
    if (error?.type === 'NETWORK_ERROR') {
      return true;
    }
    if (error instanceof Error && error.constructor.name === 'WidgetError') {
      return (error as any).type === 'NETWORK_ERROR';
    }
    const message = error?.message?.toLowerCase() || '';
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('offline') ||
      error?.name === 'NetworkError' ||
      error?.name === 'TypeError' && message.includes('failed to fetch')
    );
  }),
}));

// Mock API module
jest.mock('../lib/api', () => ({
  API: {
    widgetToken: jest.fn(() => 'https://api.test.com/api/v1/auth/widget-token'),
  },
  isApiConfigured: jest.fn(() => true),
  getApiBaseUrl: jest.fn(() => 'https://api.test.com'),
  embedOriginHeader: jest.fn(() => ({})),
}));

let createAuthError: jest.Mock;
let createNetworkError: jest.Mock;
let retryWithBackoff: jest.Mock;
let logError: jest.Mock;
let parseApiError: jest.Mock;
let isNetworkError: jest.Mock;

describe('useWidgetAuth', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.test.com';

    const mod = await import('../lib/errorHandling');
    createAuthError = mod.createAuthError as jest.Mock;
    createNetworkError = mod.createNetworkError as jest.Mock;
    retryWithBackoff = mod.retryWithBackoff as jest.Mock;
    logError = mod.logError as jest.Mock;
    parseApiError = mod.parseApiError as jest.Mock;
    isNetworkError = mod.isNetworkError as jest.Mock;
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useWidgetAuth());

    expect(result.current.authToken).toBeNull();
    expect(result.current.authError).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('validates clientId input', async () => {
    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Invalid client ID provided');
    expect(createAuthError).toHaveBeenCalledWith(
      'Invalid client ID provided',
      1001
    );
  });

  it('handles missing API base URL configuration', async () => {
    // Mock API as not configured
    const { isApiConfigured, getApiBaseUrl } = await import('../lib/api');
    (isApiConfigured as jest.Mock).mockReturnValueOnce(false);
    (getApiBaseUrl as jest.Mock).mockReturnValueOnce('');

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Configuration error: API base URL missing (got: ""). Set NEXT_PUBLIC_API_BASE_URL as a Docker build arg.');
    expect(createAuthError).toHaveBeenCalledWith(
      'Widget API base URL is not configured (got: "")',
      1002
    );
    expect(logError).toHaveBeenCalledWith(
      expect.any(Object),
      { apiBaseUrl: '' }
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('successfully gets auth token', async () => {
    const mockToken = 'test-token-123';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: mockToken }),
    });

    // Mock retryWithBackoff to call the operation function
    retryWithBackoff.mockImplementation(async (fn: any) => {
      return await fn();
    });

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBe(mockToken);
    expect(result.current.authToken).toBe(mockToken);
    expect(result.current.authError).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);

    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/auth/widget-token`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...embedOriginHeader(),
        },
        body: JSON.stringify({ client_id: 'test-client' }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('handles 403 Forbidden status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Forbidden', 1001)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('forbidden-client');
    });

    expect(token).toBeNull();
    expect(result.current.authToken).toBeNull();
    expect(result.current.authError).toBe('Forbidden');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles other 4xx client errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Bad Request' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Bad Request', 1002)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('bad-client');
    });

    expect(token).toBeNull();
    expect(result.current.authToken).toBeNull();
    expect(result.current.authError).toBe('Bad Request');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles 404 Not Found status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Not Found' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Not Found', 1002)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('not-found-client');
    });

    expect(token).toBeNull();
    expect(result.current.authToken).toBeNull();
    expect(result.current.authError).toBe('Not Found');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles error response with different format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Authentication failed', 1001)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('bad-format-client');
    });

    expect(token).toBeNull();
    expect(result.current.authToken).toBeNull();
    expect(result.current.authError).toBe('Authentication failed');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles authentication failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid credentials' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Invalid credentials', 1001)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('invalid-client');
    });

    expect(token).toBeNull();
    expect(result.current.authToken).toBeNull();
    expect(result.current.authError).toBe('Invalid credentials');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles network timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';

    mockFetch.mockRejectedValueOnce(abortError);

    retryWithBackoff.mockRejectedValue(
      createNetworkError('Authentication request timed out', 3001)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Network error. Please check your connection and try again.');
    expect(result.current.authToken).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles missing token in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}), // Missing token
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Invalid token format received', 1002)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Invalid token format received');
    expect(result.current.authToken).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Server error' }),
    });

    retryWithBackoff.mockRejectedValue(
      createNetworkError('Server error', 3003)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Network error. Please check your connection and try again.');
    expect(result.current.authToken).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles invalid response format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('Invalid JSON')),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Invalid response from authentication server', 1002)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Invalid response from authentication server');
    expect(result.current.authToken).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles 401 unauthorized response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: 'Invalid client credentials' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Invalid client credentials', 1001)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Invalid client credentials');
    expect(createAuthError).toHaveBeenCalledWith(
      'Invalid client credentials',
      1001
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('handles 403 forbidden response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Access forbidden' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Access forbidden', 1001)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Access forbidden');
    expect(createAuthError).toHaveBeenCalledWith(
      'Access forbidden',
      1001
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('handles 500 server error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal server error' }),
    });

    retryWithBackoff.mockRejectedValue(
      createNetworkError('Internal server error', 3003)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Network error. Please check your connection and try again.');
    expect(createNetworkError).toHaveBeenCalledWith(
      'Internal server error',
      3003
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('handles other error status codes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Bad request' }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Bad request', 1002)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Bad request');
    expect(createAuthError).toHaveBeenCalledWith(
      'Bad request',
      1002
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('handles missing token in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Invalid token format received', 1002)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Invalid token format received');
    expect(result.current.authToken).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('handles invalid token type in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: 123 }),
    });

    retryWithBackoff.mockRejectedValue(
      createAuthError('Invalid token format received', 1002)
    );

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Invalid token format received');
    expect(result.current.authToken).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('clears auth state', () => {
    const { result } = renderHook(() => useWidgetAuth());

    act(() => {
      result.current.setAuthToken('test-token');
      result.current.setAuthError('test-error');
    });

    expect(result.current.authToken).toBe('test-token');
    expect(result.current.authError).toBe('test-error');

    act(() => {
      result.current.clearAuth();
    });

    expect(result.current.authToken).toBeNull();
    expect(result.current.authError).toBeNull();
    expect(result.current.retryCount).toBe(0);
  });

  it('refreshes token', async () => {
    const mockToken = 'new-token-123';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: mockToken }),
    });

    retryWithBackoff.mockResolvedValue(mockToken);

    const { result } = renderHook(() => useWidgetAuth());

    // Set initial token
    act(() => {
      result.current.setAuthToken('old-token');
    });

    let token;
    await act(async () => {
      token = await result.current.refreshToken('test-client');
    });

    expect(token).toBe(mockToken);
    expect(result.current.authToken).toBe(mockToken);
  });

  it('sets loading state during authentication', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: 'test-token' }),
    });

    retryWithBackoff.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve('test-token'), 100))
    );

    const { result } = renderHook(() => useWidgetAuth());

    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.getAuthToken('test-client');
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('handles retry logic and calls onRetry callback', async () => {
    // Mock fetch to succeed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: 'retry-token' }),
    });

    // Reset and mock retryWithBackoff to call onRetry
    retryWithBackoff.mockReset();
    retryWithBackoff.mockResolvedValue('retry-token');

    // Also mock to call onRetry
    retryWithBackoff.mockImplementation(async (fn: any, options: any) => {
      options?.onRetry?.(1, new Error('Simulated retry error'));
      return 'retry-token';
    });

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBe('retry-token');
    expect(logError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        clientId: 'test-client',
        attempt: 1,
        message: 'Retrying authentication...'
      })
    );
  });

  it('handles generic error with message fallback', async () => {
    const genericError = new Error('Some unexpected error');

    retryWithBackoff.mockRejectedValue(genericError);

    const { result } = renderHook(() => useWidgetAuth());

    let token;
    await act(async () => {
      token = await result.current.getAuthToken('test-client');
    });

    expect(token).toBeNull();
    expect(result.current.authError).toBe('Some unexpected error');
    expect(result.current.isLoading).toBe(false);
  });

  // Tests that actually execute the fetch logic inside retryWithBackoff
  describe('direct fetch execution tests', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      mockFetch.mockReset();
      (retryWithBackoff as jest.Mock).mockReset();
      (createAuthError as jest.Mock).mockReset();
      (createNetworkError as jest.Mock).mockReset();
      (parseApiError as jest.Mock).mockReset();
      (logError as jest.Mock).mockReset();

      // Re-setup the mocks after reset
      (createAuthError as jest.Mock).mockImplementation((message, code) => {
        const error = new Error(message);
        (error as any).code = code;
        (error as any).type = 'AUTH_ERROR';
        (error as any).userMessage = message;
        return error;
      });

      // import the real module rather than the mocked version
      const { WidgetError } = jest.requireActual('../lib/errorHandling');

      (createNetworkError as jest.Mock).mockImplementation((message, code) => {
        return new WidgetError(
          message,
          code,
          'NETWORK_ERROR',
          true,
          'Network error. Please check your connection and try again.'
        );
      });

      (parseApiError as jest.Mock).mockImplementation((data, defaultMessage) => data?.message || data?.detail || defaultMessage);

      (logError as jest.Mock).mockImplementation(() => {});

      // Mock retryWithBackoff to actually execute the function
      (retryWithBackoff as jest.Mock).mockImplementation(async (fn) => await fn());
    });

    it('throws createAuthError when JSON parsing fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Malformed JSON')),
      });

      const { result } = renderHook(() => useWidgetAuth());

      let token;
      await act(async () => {
        token = await result.current.getAuthToken('test-client');
      });

      expect(token).toBeNull();
      expect(createAuthError).toHaveBeenCalledTimes(1);
      expect(createAuthError).toHaveBeenCalledWith(
        'Invalid response from authentication server',
        1002
      );
      expect(result.current.authError).toBe('Invalid response from authentication server');
    });

    it('calls parseApiError and throws for 401 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized access' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(parseApiError).toHaveBeenCalledTimes(1);
      expect(parseApiError).toHaveBeenCalledWith(
        { message: 'Unauthorized access' },
        'Authentication failed'
      );
      expect(createAuthError).toHaveBeenCalledTimes(1);
      expect(createAuthError).toHaveBeenCalledWith(
        'Unauthorized access',
        1001
      );
    });

    it('calls parseApiError and throws for 403 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Forbidden' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(parseApiError).toHaveBeenCalledTimes(1);
      expect(parseApiError).toHaveBeenCalledWith(
        { message: 'Forbidden' },
        'Authentication failed'
      );
      expect(createAuthError).toHaveBeenCalledTimes(1);
      expect(createAuthError).toHaveBeenCalledWith(
        'Forbidden',
        1001
      );
    });

    it('calls parseApiError and creates network error for 500 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server error' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(parseApiError).toHaveBeenCalledTimes(1);
      expect(parseApiError).toHaveBeenCalledWith(
        { message: 'Server error' },
        'Authentication failed'
      );
      expect(createNetworkError).toHaveBeenCalledTimes(1);
      expect(createNetworkError).toHaveBeenCalledWith(
        'Server error',
        3003
      );
    });

    it('calls parseApiError and creates network error for 503 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ detail: 'Service unavailable' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(parseApiError).toHaveBeenCalledTimes(1);
      expect(createNetworkError).toHaveBeenCalledTimes(1);
      expect(createNetworkError).toHaveBeenCalledWith(
        expect.any(String),
        3003
      );
    });

    it('throws auth error for other non-ok status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Bad request' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(parseApiError).toHaveBeenCalledTimes(1);
      expect(parseApiError).toHaveBeenCalledWith(
        { message: 'Bad request' },
        'Authentication failed'
      );
      expect(createAuthError).toHaveBeenCalledTimes(1);
      expect(createAuthError).toHaveBeenCalledWith(
        'Bad request',
        1002
      );
    });

    it('throws error when token is missing from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(createAuthError).toHaveBeenCalledTimes(1);
      expect(createAuthError).toHaveBeenCalledWith(
        'Invalid token format received',
        1002
      );
    });

    it('throws error when token is not a string', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 12345 }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(createAuthError).toHaveBeenCalledTimes(1);
      expect(createAuthError).toHaveBeenCalledWith(
        'Invalid token format received',
        1002
      );
    });

    it('throws error when token is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: null }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(result.current.authError).toBe('Invalid token format received');
    });

    it('clears timeout and handles AbortError correctly', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';

      mockFetch.mockRejectedValueOnce(abortError);

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      expect(result.current.authError).toBe('Network error. Please check your connection and try again.');
    });

    it('clears timeout and re-throws non-AbortError fetch errors', async () => {
      const networkError = new Error('Network failure');
      networkError.name = 'TypeError';

      mockFetch.mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client');
      });

      // The error should be re-thrown and caught by the outer handler
      expect(result.current.authError).toBeTruthy();
    });

    it('maps origin_not_allowed code to origin-specific user message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ detail: 'Origin not allowed for this client_id', code: 'origin_not_allowed' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client-id');
      });

      expect(result.current.authError).toBe('This website origin is not allowed for this widget. Ask your admin to add this site to allowed origins.');
      expect(result.current.authToken).toBeNull();
      expect(result.current.isLoading).toBe(false);
      // expose the machine-readable code so EmbedClient can relay origin_not_allowed
      expect(result.current.authErrorCode).toBe(1004);
      expect(createAuthError).toHaveBeenCalledWith(
        expect.any(String),
        1004
      );
    });

    it('maps missing_origin_header code to origin-specific user message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ detail: 'Missing Origin header for restricted client_id', code: 'missing_origin_header' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client-id');
      });

      expect(result.current.authError).toBe('This website origin is not allowed for this widget. Ask your admin to add this site to allowed origins.');
      expect(result.current.authToken).toBeNull();
      expect(result.current.isLoading).toBe(false);
      // expose the machine-readable code so EmbedClient can relay origin_not_allowed
      expect(result.current.authErrorCode).toBe(1004);
      expect(createAuthError).toHaveBeenCalledWith(
        expect.any(String),
        1004
      );
    });

    it('uses fallback behavior for other 400 errors without origin codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Bad request' }),
      });

      const { result } = renderHook(() => useWidgetAuth());

      await act(async () => {
        await result.current.getAuthToken('test-client-id');
      });

      expect(result.current.authError).toBe('Bad request');
      expect(result.current.authToken).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(createAuthError).toHaveBeenCalledWith('Bad request', 1002);
    });
  });
});