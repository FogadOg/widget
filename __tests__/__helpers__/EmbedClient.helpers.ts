import * as helpers from '../../app/embed/session/helpers';

import { translationsMock } from '../__fixtures__/EmbedClient.fixtures';

const mockHelpers = helpers as jest.Mocked<typeof helpers>;

// ---------------------------------------------------------------------------
// Response factories
// ---------------------------------------------------------------------------

export function createMockResponse(body: object, status = 200): object {

  return {

    ok: status >= 200 && status < 300,

    status,

    json: async () => body,

    text: async () => JSON.stringify(body),

  };

}

export function createWidgetConfigResponse(data: object = {}): object {

  return createMockResponse({

    status: 'success',

    data: {

      primary_color: '#000000',

      secondary_color: '#ffffff',

      show_unread_badge: true,

      start_open: false,

      hide_on_mobile: false,

      position: 'bottom-right',

      edge_offset: 20,

      button_size: 'md',

      size: 'md',

      ...data,

    },

  });

}

export function createSessionResponse(data: object = {}): object {

  return createMockResponse({

    status: 'success',

    data: {

      session_id: 'new-session-123',

      expires_at: '2026-12-31T23:59:59Z',

      ...data,

    },

  });

}

export function createMessagesResponse(messages: object[] = []): object {

  return createMockResponse({

    status: 'success',

    data: { messages },

  });

}

// ---------------------------------------------------------------------------
// Default mockFetch factory (the base handler used in beforeEach)
// ---------------------------------------------------------------------------

export function mockFetchFactory(): jest.Mock {

  return jest.fn((url: string) => {

    // Agent details

    if (url.includes('/agents/') && !url.includes('/sessions')) {

      return Promise.resolve({

        ok: true,

        status: 200,

        json: async () => ({

          status: 'success',

          data: { name: 'Test Agent', default_language: 'en' }

        }),

      });

    }

    // Widget config

    if (url.includes('/widget-config/')) {

      return Promise.resolve(createWidgetConfigResponse());

    }

    // Create session

    if (url.includes('/sessions') && !url.includes('/messages')) {

      return Promise.resolve(createSessionResponse());

    }

    // Get messages

    if (url.includes('/messages') && !url.includes('POST')) {

      return Promise.resolve(createMessagesResponse());

    }

    // Send message (POST)

    if (url.includes('/messages') && url.includes('POST')) {

      return Promise.resolve({

        ok: true,

        status: 200,

        json: async () => ({

          status: 'success',

          data: {

            message: {

              id: 'msg-user-1',

              content: 'Test message',

              sender: 'user',

              created_at: '2026-03-05T12:00:00Z'

            },

            response: {

              id: 'msg-asst-1',

              content: 'Response',

              sender: 'assistant',

              created_at: '2026-03-05T12:00:01Z'

            },

          },

        }),

      });

    }

    // Message feedback endpoints

    if (url.includes('/feedback') || url.includes('messageFeedback') || url.includes('message-feedback')) {

      return Promise.resolve({

        ok: true,

        status: 200,

        json: async () => ({ status: 'success' }),

        text: async () => 'ok'

      });

    }

    return Promise.reject(new Error(`Unmocked URL: ${url}`));

  });

}

// ---------------------------------------------------------------------------
// setupMockFetch — installs a mockFetch on global.fetch with the fallback wrapper
// ---------------------------------------------------------------------------

export function setupMockFetch(mockFetch: jest.Mock): void {

  // Wrap mockFetch so that tests which replace mockFetch and may reject
  // still get a sensible default for feedback-related endpoints.

  global.fetch = (async (url: string, options?: any) => {

    try {

      return await (mockFetch as any)(url, options);

    } catch (err) {

      if (

        typeof url === 'string' &&

        url.includes('/feedback') &&

        (!options?.method || options?.method === 'GET')

      ) {

        return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'success', data: { has_feedback: false } }), text: async () => 'ok' });

      }

      throw err;

    }

  }) as any;

}

// ---------------------------------------------------------------------------
// Hook-style setup helpers (called inside beforeEach)
// ---------------------------------------------------------------------------

export function setupAuthTokenMock(mockGetAuthToken: jest.Mock): void {

  const useWidgetAuth = require('../../hooks/useWidgetAuth').useWidgetAuth;

  useWidgetAuth.mockReturnValue({

    getAuthToken: mockGetAuthToken,

    authToken: 'test-token',

    authError: null,

  });

}

export function setupTranslationMock(): void {

  const useWidgetTranslation = require('../../hooks/useWidgetTranslation').useWidgetTranslation;

  useWidgetTranslation.mockReturnValue({

    translations: translationsMock,

    locale: 'en',

  });

}

export function setupLocalStorageMock(): void {

  const localStorageMock = {

    getItem: jest.fn(),

    setItem: jest.fn(),

    removeItem: jest.fn(),

    clear: jest.fn(),

    length: 0,

    key: jest.fn(),

  };

  Object.defineProperty(window, 'localStorage', {

    value: localStorageMock,

    writable: true

  });

}

export function setupWindowMocks(): void {

  Object.defineProperty(window, 'performance', {

    value: { now: jest.fn(() => 1000) },

    writable: true,

  });

  Object.defineProperty(window, 'innerWidth', {

    value: 1024,

    writable: true

  });

  Object.defineProperty(navigator, 'userAgent', {

    value: 'Mozilla/5.0 Desktop',

    writable: true

  });

  Object.defineProperty(window, 'parent', {

    value: {

      postMessage: jest.fn(),

    },

    writable: true,

  });

}

export function setupBeforeEach(): { mockFetch: jest.Mock; mockGetAuthToken: jest.Mock } {

  jest.useRealTimers();

  jest.clearAllMocks();

  // Setup helpers mocks

  mockHelpers.sessionStorageKey.mockReturnValue('session-key');

  mockHelpers.unreadStorageKey.mockReturnValue('unread-key');

  mockHelpers.lastReadStorageKey.mockReturnValue('lastread-key');

  mockHelpers.getVisitorId.mockReturnValue('visitor-123');

  mockHelpers.getPageContext.mockReturnValue({

    url: 'https://example.com/test',

    pathname: '/test',

    title: 'Test Page',

    referrer: null,

  });

  mockHelpers.getStoredSession.mockReturnValue(null);

  mockHelpers.storeSession.mockImplementation(() => {});

  // Setup auth token mock

  const mockGetAuthToken = jest.fn().mockResolvedValue('test-token');

  setupAuthTokenMock(mockGetAuthToken);

  // Setup translation mock

  setupTranslationMock();

  // Setup localStorage mock

  setupLocalStorageMock();

  // Setup fetch mock

  const mockFetch = mockFetchFactory();

  setupMockFetch(mockFetch);

  // Setup window mocks

  setupWindowMocks();

  return { mockFetch, mockGetAuthToken };

}
