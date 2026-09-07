import { act, renderHook, waitFor } from '@testing-library/react';
import { useQueuedMessageManagement } from '../app/embed/session/hooks/useQueuedMessageManagement';
import {
  getQueuedMessages,
  removeQueuedMessage,
  incrementAttempt,
  isQueueItemStale,
} from '../src/lib/offline';

jest.mock('../app/embed/session/helpers', () => ({
  ...jest.requireActual('../app/embed/session/helpers'),
  getStoredSession: jest.fn(),
  getPageContext: jest.fn(),
}));

jest.mock('../src/lib/offline', () => ({
  getQueuedMessages: jest.fn(),
  removeQueuedMessage: jest.fn(),
  incrementAttempt: jest.fn(),
  isQueueItemStale: jest.fn(),
}));

const mockGet = getQueuedMessages as jest.MockedFunction<typeof getQueuedMessages>;
const mockRemove = removeQueuedMessage as jest.MockedFunction<typeof removeQueuedMessage>;
const mockIncrement = incrementAttempt as jest.MockedFunction<typeof incrementAttempt>;
const mockStale = isQueueItemStale as jest.MockedFunction<typeof isQueueItemStale>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const helpers = require('../app/embed/session/helpers');

const item = (over: Record<string, unknown> = {}) => ({
  id: 'q1',
  text: 'hello',
  seq: 1,
  attempts: 0,
  source: 'chat',
  ...over,
});

const response = (status: number, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k: string) => headers[k] ?? null },
});

let setMessages: jest.Mock;
let loadSessionMessages: jest.Mock;

const setup = () => {
  setMessages = jest.fn();
  loadSessionMessages = jest.fn().mockResolvedValue(undefined);
  return renderHook(() =>
    useQueuedMessageManagement({
      sessionId: 'sess-1',
      sessionIdRef: { current: 'sess-1' },
      authToken: 'tok',
      authTokenRef: { current: 'tok' },
      activeLocale: 'en',
      embedHeaders: { 'X-Embed': '1' },
      sessionStorageKey: 'companin-session',
      didInitialFlushRef: { current: true },
      setMessages,
      loadSessionMessages,
    } as never),
  );
};

/** Apply every setMessages updater to a starting list and return the result. */
const applyUpdates = (start: Array<Record<string, unknown>>) =>
  setMessages.mock.calls.reduce(
    (acc, [updater]) => (typeof updater === 'function' ? updater(acc) : acc),
    start,
  );

describe('useQueuedMessageManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue([]);
    mockRemove.mockResolvedValue(undefined as never);
    mockIncrement.mockResolvedValue(undefined as never);
    mockStale.mockReturnValue(false);
    helpers.getStoredSession.mockReturnValue({ sessionId: 'sess-1' });
    helpers.getPageContext.mockReturnValue({});
    global.fetch = jest.fn().mockResolvedValue(response(200)) as never;
  });

  afterEach(() => jest.restoreAllMocks());

  test('exposes a flush function', () => {
    const { result } = setup();
    expect(typeof result.current.flushQueuedMessages).toBe('function');
  });

  test('does nothing when the queue is empty', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.flushQueuedMessages();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sends a queued message and reloads the transcript', async () => {
    mockGet.mockResolvedValue([item()] as never);
    const { result } = setup();

    await act(async () => {
      await result.current.flushQueuedMessages();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith('q1');
    expect(loadSessionMessages).toHaveBeenCalled();
  });

  test('sends a stable idempotency key so a retry is de-duped', async () => {
    // Otherwise a retry creates a second message and a second reply.
    mockGet.mockResolvedValue([item()] as never);
    const { result } = setup();

    await act(async () => {
      await result.current.flushQueuedMessages();
    });

    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.headers['Idempotency-Key']).toBe('q1');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['X-Embed']).toBe('1');
  });

  test('replays in queue order', async () => {
    mockGet.mockResolvedValue([
      item({ id: 'b', seq: 2, text: 'second' }),
      item({ id: 'a', seq: 1, text: 'first' }),
    ] as never);
    const { result } = setup();

    await act(async () => {
      await result.current.flushQueuedMessages();
    });

    const firstBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(firstBody.content).toBe('first');
  });

  test('only replays items this flusher owns', async () => {
    // Docs and prompt-input have their own flushers with different semantics.
    mockGet.mockResolvedValue([
      item({ id: 'docs', source: 'docs' }),
      item({ id: 'legacy', source: undefined }),
    ] as never);
    const { result } = setup();

    await act(async () => {
      await result.current.flushQueuedMessages();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers['Idempotency-Key']).toBe('legacy');
  });

  test('does not flush without a session or token', async () => {
    helpers.getStoredSession.mockReturnValue(null);
    setMessages = jest.fn();
    loadSessionMessages = jest.fn();
    const { result } = renderHook(() =>
      useQueuedMessageManagement({
        sessionId: null,
        sessionIdRef: { current: null },
        authToken: null,
        authTokenRef: { current: null },
        activeLocale: 'en',
        embedHeaders: {},
        sessionStorageKey: 'k',
        didInitialFlushRef: { current: true },
        setMessages,
        loadSessionMessages,
      } as never),
    );

    await act(async () => {
      await result.current.flushQueuedMessages();
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('drops a stale item rather than posting it as a new message', async () => {
    // The server's idempotency replay is scoped to the original conversation.
    mockGet.mockResolvedValue([item()] as never);
    mockStale.mockReturnValue(true);
    const { result } = setup();

    await act(async () => {
      await result.current.flushQueuedMessages();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('q1');
    expect(applyUpdates([{ id: 'q1', pending: true }])[0]).toMatchObject({
      pending: false,
      failed: true,
    });
  });

  test('drops an item that has exhausted its attempts', async () => {
    mockGet.mockResolvedValue([item({ attempts: 5 })] as never);
    const { result } = setup();

    await act(async () => {
      await result.current.flushQueuedMessages();
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('q1');
  });

  describe('error handling', () => {
    test('drops a permanent 4xx instead of head-of-line blocking the queue', async () => {
      mockGet.mockResolvedValue([item({ id: 'bad' }), item({ id: 'good', seq: 2 })] as never);
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(response(400))
        .mockResolvedValueOnce(response(200));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      expect(mockRemove).toHaveBeenCalledWith('bad');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockIncrement).not.toHaveBeenCalled();
    });

    test('retries a transient 5xx and stops the flush', async () => {
      mockGet.mockResolvedValue([item({ id: 'a' }), item({ id: 'b', seq: 2 })] as never);
      (global.fetch as jest.Mock).mockResolvedValue(response(500));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      expect(mockIncrement).toHaveBeenCalledWith('a');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('treats 408 as transient', async () => {
      mockGet.mockResolvedValue([item()] as never);
      (global.fetch as jest.Mock).mockResolvedValue(response(408));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      expect(mockIncrement).toHaveBeenCalledWith('q1');
    });

    test('marks a message failed once attempts run out', async () => {
      mockGet.mockResolvedValue([item({ attempts: 4 })] as never);
      (global.fetch as jest.Mock).mockResolvedValue(response(500));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      expect(mockRemove).toHaveBeenCalledWith('q1');
      expect(applyUpdates([{ id: 'q1', pending: true }])[0]).toMatchObject({ failed: true });
    });

    test('increments attempts when the request throws', async () => {
      mockGet.mockResolvedValue([item()] as never);
      (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      expect(mockIncrement).toHaveBeenCalledWith('q1');
    });
  });

  describe('rate limiting', () => {
    test('backs off for the Retry-After seconds a 429 names', async () => {
      mockGet.mockResolvedValue([item({ id: 'a' }), item({ id: 'b', seq: 2 })] as never);
      (global.fetch as jest.Mock).mockResolvedValue(response(429, { 'Retry-After': '60' }));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // The cooldown blocks the very next flush entirely.
      (global.fetch as jest.Mock).mockClear();
      await act(async () => {
        await result.current.flushQueuedMessages();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('accepts an HTTP-date Retry-After', async () => {
      mockGet.mockResolvedValue([item()] as never);
      const future = new Date(Date.now() + 60_000).toUTCString();
      (global.fetch as jest.Mock).mockResolvedValue(response(429, { 'Retry-After': future }));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      (global.fetch as jest.Mock).mockClear();
      await act(async () => {
        await result.current.flushQueuedMessages();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('falls back to the default cooldown for a missing header', async () => {
      mockGet.mockResolvedValue([item()] as never);
      (global.fetch as jest.Mock).mockResolvedValue(response(429));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      (global.fetch as jest.Mock).mockClear();
      await act(async () => {
        await result.current.flushQueuedMessages();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('falls back for an unparseable header', async () => {
      mockGet.mockResolvedValue([item()] as never);
      (global.fetch as jest.Mock).mockResolvedValue(response(429, { 'Retry-After': 'soon' }));
      const { result } = setup();

      await act(async () => {
        await result.current.flushQueuedMessages();
      });

      (global.fetch as jest.Mock).mockClear();
      await act(async () => {
        await result.current.flushQueuedMessages();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  test('ignores a second flush while one is already running', async () => {
    mockGet.mockResolvedValue([item()] as never);
    let release: (v: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValue(new Promise((r) => { release = r; }));
    const { result } = setup();

    let first: Promise<void>;
    await act(async () => {
      first = result.current.flushQueuedMessages();
      await result.current.flushQueuedMessages();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(response(200));
      await first!;
    });
  });

  test('adds a queued message to the transcript on the queued event', async () => {
    setup();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('companin:queued-message', {
          detail: { id: 'q9', text: 'offline note', timestamp: 1, attempts: 0 },
        }),
      );
    });

    await waitFor(() => expect(setMessages).toHaveBeenCalled());
  });
});
