/**
 * The docs-widget session hook (`app/embed/docs/hooks/useSessionManagement`).
 * Covers session creation, restore/fallback, the afterReceive interceptor and
 * the 429 cooldown that gates all three.
 */
import { act, renderHook } from '@testing-library/react';
import { useSessionManagement } from '../app/embed/docs/hooks/useSessionManagement';
import { fetchWithTimeout } from '../app/embed/docs/resilientFetch';

jest.mock('../app/embed/docs/resilientFetch', () => ({ fetchWithTimeout: jest.fn() }));

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

const res = (
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k: string) => headers[k] ?? null },
  json: async () => body,
});

let setSessionId: jest.Mock;
let setError: jest.Mock;
let setMessages: jest.Mock;
let setIsInitialLoad: jest.Mock;

const setup = (interceptIncoming?: (c: string) => Promise<string | null>) => {
  setSessionId = jest.fn();
  setError = jest.fn();
  setMessages = jest.fn();
  setIsInitialLoad = jest.fn();
  return renderHook(() =>
    useSessionManagement({
      agentId: 'agent-1',
      activeLocale: 'en',
      clientId: 'client-1',
      initialParentOrigin: 'https://host.example',
      embedHeaders: { 'X-Embed': '1' },
      setSessionId,
      setError,
      setMessages,
      setIsInitialLoad,
      interceptIncoming,
    }),
  );
};

const created = {
  status: 'success',
  data: { session_id: 'sess-1', expires_at: '2030-01-01T00:00:00Z' },
};
const transcript = {
  status: 'success',
  data: {
    messages: [
      { id: 'm1', content: 'Hi', sender: 'user', created_at: '2026-09-01T10:00:00Z' },
      { id: 'm2', content: 'Hello!', sender: 'assistant', created_at: '2026-09-01T10:00:01Z' },
    ],
  },
};

describe('docs useSessionManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockFetch.mockResolvedValue(res(200, created) as never);
  });

  describe('createSession', () => {
    test('creates a session and stores its id', async () => {
      mockFetch
        .mockResolvedValueOnce(res(201, created) as never)
        .mockResolvedValueOnce(res(200, transcript) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(setSessionId).toHaveBeenCalledWith('sess-1');
    });

    test('loads the transcript straight after creating', async () => {
      mockFetch
        .mockResolvedValueOnce(res(201, created) as never)
        .mockResolvedValueOnce(res(200, transcript) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(setIsInitialLoad).toHaveBeenCalledWith(false);
    });

    test('surfaces a server-provided detail message', async () => {
      // Rate-limit and config messages are already meant to be user-facing.
      mockFetch.mockResolvedValue(res(400, { detail: 'Agent is disabled' }) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(setError).toHaveBeenCalledWith('Agent is disabled');
    });

    test('falls back to a localized message when the server sends none', async () => {
      mockFetch.mockResolvedValue(res(500, {}) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(setError).toHaveBeenCalledWith(expect.any(String));
    });

    test('shows a friendly message on a network drop', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNRESET'));
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(setError).toHaveBeenCalledWith(expect.any(String));
      expect(setError.mock.calls[0][0]).not.toMatch(/ECONNRESET/);
    });

    test('passes variant info through when A/B testing is on', async () => {
      mockFetch
        .mockResolvedValueOnce(res(201, created) as never)
        .mockResolvedValueOnce(res(200, transcript) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok', { variant_id: 'v1', variant_name: 'Teal' });
      });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(body.metadata).toMatchObject({ variant_id: 'v1', variant_name: 'Teal' });
    });
  });

  describe('rate limiting', () => {
    test('names the wait when Retry-After gives seconds', async () => {
      mockFetch.mockResolvedValue(res(429, {}, { 'Retry-After': '45' }) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(setError).toHaveBeenCalledWith(expect.stringMatching(/45/));
    });

    test('falls back to a generic message with no Retry-After', async () => {
      mockFetch.mockResolvedValue(res(429, {}) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(setError).toHaveBeenCalledWith(expect.any(String));
    });

    test('accepts an HTTP-date Retry-After', async () => {
      const future = new Date(Date.now() + 45_000).toUTCString();
      mockFetch.mockResolvedValue(res(429, {}, { 'Retry-After': future }) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(setError).toHaveBeenCalled();
    });

    test('blocks the next attempt while the cooldown is running', async () => {
      mockFetch.mockResolvedValue(res(429, {}, { 'Retry-After': '60' }) as never);
      const { result } = setup();
      await act(async () => {
        await result.current.createSession('tok');
      });

      mockFetch.mockClear();
      await act(async () => {
        await result.current.createSession('tok');
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(setError).toHaveBeenCalled();
    });
  });

  describe('validateAndRestoreSession', () => {
    test('restores a valid session', async () => {
      mockFetch.mockResolvedValue(res(200, transcript) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.validateAndRestoreSession('sess-1', 'tok');
      });

      expect(setMessages).toHaveBeenCalled();
      expect(setIsInitialLoad).toHaveBeenCalledWith(false);
    });

    test('refuses an empty session id', async () => {
      const { result } = setup();

      await act(async () => {
        await result.current.validateAndRestoreSession('', 'tok');
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('starts a fresh session when the stored one is gone', async () => {
      localStorage.setItem('companin_docs_session_client-1_agent-1', 'x');
      mockFetch
        .mockResolvedValueOnce(res(404, {}) as never)
        .mockResolvedValueOnce(res(201, created) as never)
        .mockResolvedValueOnce(res(200, transcript) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.validateAndRestoreSession('stale', 'tok');
      });

      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    });

    test('starts a fresh session when validation throws', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(res(201, created) as never)
        .mockResolvedValueOnce(res(200, transcript) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.validateAndRestoreSession('sess-1', 'tok');
      });

      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);
    });

    test('reports a rate limit rather than restarting the session', async () => {
      mockFetch.mockResolvedValue(res(429, {}, { 'Retry-After': '30' }) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.validateAndRestoreSession('sess-1', 'tok');
      });

      expect(setError).toHaveBeenCalledWith(expect.stringMatching(/30/));
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadSessionMessages', () => {
    test('falls back to the greeting for an empty transcript', async () => {
      mockFetch.mockResolvedValue(res(200, { status: 'success', data: { messages: [] } }) as never);
      const { result } = setup();

      await act(async () => {
        await result.current.loadSessionMessages('sess-1', 'tok');
      });

      expect(setMessages).toHaveBeenCalled();
      const passed = setMessages.mock.calls.at(-1)![0];
      expect(Array.isArray(passed) ? passed.length : 0).toBeGreaterThan(0);
    });

    test('swallows a load failure rather than breaking the panel', async () => {
      mockFetch.mockRejectedValue(new Error('boom'));
      const { result } = setup();

      await expect(
        act(async () => {
          await result.current.loadSessionMessages('sess-1', 'tok');
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('afterReceive interceptor', () => {
    test('rewrites the newest agent reply', async () => {
      const interceptIncoming = jest.fn().mockResolvedValue('Rewritten');
      mockFetch.mockResolvedValue(res(200, transcript) as never);
      const { result } = setup(interceptIncoming);

      await act(async () => {
        await result.current.loadSessionMessages('sess-1', 'tok');
      });

      expect(interceptIncoming).toHaveBeenCalledWith('Hello!');
    });

    test('does not intercept a restored transcript', async () => {
      // Those are seeded, not just received.
      const interceptIncoming = jest.fn().mockResolvedValue('Rewritten');
      mockFetch.mockResolvedValue(res(200, transcript) as never);
      const { result } = setup(interceptIncoming);

      await act(async () => {
        await result.current.validateAndRestoreSession('sess-1', 'tok');
      });

      expect(interceptIncoming).not.toHaveBeenCalled();
    });

    test('leaves the reply alone when the host returns null', async () => {
      const interceptIncoming = jest.fn().mockResolvedValue(null);
      mockFetch.mockResolvedValue(res(200, transcript) as never);
      const { result } = setup(interceptIncoming);

      await act(async () => {
        await result.current.loadSessionMessages('sess-1', 'tok');
      });

      expect(setMessages).toHaveBeenCalled();
    });

    test('does nothing when the transcript has no agent reply', async () => {
      const interceptIncoming = jest.fn();
      mockFetch.mockResolvedValue(
        res(200, { status: 'success', data: { messages: [{ id: 'm1', content: 'Hi', sender: 'user' }] } }) as never,
      );
      const { result } = setup(interceptIncoming);

      await act(async () => {
        await result.current.loadSessionMessages('sess-1', 'tok');
      });

      expect(interceptIncoming).not.toHaveBeenCalled();
    });
  });
});
